// Package httpx is the shared HTTP kernel: the router builder, common middleware,
// JSON helpers, and graceful serve. Every binary (node, controlplane) builds its
// router here so the middleware chain order is identical everywhere ([02]).
package httpx

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// NewRouter returns a chi router with the common middleware stack and a /healthz
// liveness endpoint that walks the whole chain. allowedOrigins enables browser CORS
// (the SPA and the API are served from different origins in dev: :5173/:5174 vs :8091).
func NewRouter(serviceName string, allowedOrigins ...string) *chi.Mux {
	r := chi.NewRouter()
	if len(allowedOrigins) > 0 {
		r.Use(CORS(allowedOrigins)) // first: must answer OPTIONS before auth/tenant gates
	}
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	// Liveness: no dependencies, proves the process + middleware chain are up.
	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		JSON(w, http.StatusOK, map[string]string{"status": "ok", "service": serviceName})
	})
	return r
}

// CORS is a small browser-CORS middleware. It reflects an allowed Origin, advertises the
// methods + headers the clients use (incl. the custom X-Tenant-ID), and short-circuits
// the preflight OPTIONS — which must happen BEFORE the auth/tenant middleware, or a
// preflight to a protected route would be rejected 401. Use "*" to allow any origin.
func CORS(allowed []string) func(http.Handler) http.Handler {
	allowAny := false
	set := make(map[string]bool, len(allowed))
	for _, o := range allowed {
		if o == "*" {
			allowAny = true
		}
		set[o] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && (allowAny || set[origin]) {
				if allowAny {
					w.Header().Set("Access-Control-Allow-Origin", "*")
				} else {
					w.Header().Set("Access-Control-Allow-Origin", origin)
					w.Header().Add("Vary", "Origin")
				}
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Tenant-ID")
				w.Header().Set("Access-Control-Max-Age", "300")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// Serve runs the HTTP server with graceful shutdown on SIGINT/SIGTERM.
func Serve(addr string, h http.Handler) error {
	srv := &http.Server{Addr: addr, Handler: h, ReadHeaderTimeout: 5 * time.Second}

	go func() {
		slog.Info("http listening", "addr", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("listen", "err", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	slog.Info("shutting down")
	return srv.Shutdown(ctx)
}

// JSON writes v as a JSON response with the given status.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// Error writes a JSON error envelope.
func Error(w http.ResponseWriter, status int, msg string) {
	JSON(w, status, map[string]string{"error": msg})
}
