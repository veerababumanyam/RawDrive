package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func serveWithGracefulShutdown(srv *http.Server, certPath, keyPath string, onShutdown func()) {
	serverErr := make(chan error, 1)
	go func() {
		if certPath != "" && keyPath != "" {
			serverErr <- srv.ListenAndServeTLS(certPath, keyPath)
			return
		}
		serverErr <- srv.ListenAndServe()
	}()

	shutdownCtx, stopSignals := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopSignals()

	select {
	case err := <-serverErr:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	case <-shutdownCtx.Done():
		log.Println("server: shutdown signal received; draining HTTP server and workers")
		if onShutdown != nil {
			onShutdown()
		}

		drainCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := srv.Shutdown(drainCtx); err != nil {
			log.Fatalf("server graceful shutdown failed: %v", err)
		}
		if err := <-serverErr; err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error during shutdown: %v", err)
		}
		log.Println("server: graceful shutdown complete")
	}
}
