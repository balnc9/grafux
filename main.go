package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/exec"
	"runtime"

	"grafux/scanner"
	"grafux/server"
)

func main() {
	depth := flag.Int("depth", 5, "Max directory depth (0 = unlimited)")
	port := flag.Int("port", 0, "Port to serve on (0 = random available port)")
	noOpen := flag.Bool("no-open", false, "Don't auto-open browser")
	showHidden := flag.Bool("show-hidden", false, "Include hidden files and folders")
	flag.Parse()

	root := "."
	if flag.NArg() > 0 {
		root = flag.Arg(0)
	}

	if _, err := os.Stat(root); err != nil {
		log.Fatalf("Cannot access directory: %v", err)
	}

	graph, err := scanner.Scan(root, scanner.Options{
		MaxDepth:   *depth,
		ShowHidden: *showHidden,
	})
	if err != nil {
		log.Fatalf("Scan failed: %v", err)
	}

	addr, err := server.Start(*port, graph)
	if err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}

	url := fmt.Sprintf("http://%s", addr)
	fmt.Printf("Grafux: %s\n", url)
	fmt.Printf("  %d files · %d folders · depth %d\n",
		graph.Meta.TotalFiles, graph.Meta.TotalFolders, *depth)
	fmt.Println("  Press Ctrl+C to stop")

	if !*noOpen {
		openBrowser(url)
	}

	// Block forever — server runs in a goroutine
	select {}
}

func openBrowser(url string) {
	var cmd string
	var args []string

	switch runtime.GOOS {
	case "darwin":
		cmd = "open"
		args = []string{url}
	case "linux":
		cmd = "xdg-open"
		args = []string{url}
	case "windows":
		cmd = "cmd"
		args = []string{"/c", "start", url}
	default:
		return
	}

	if err := exec.Command(cmd, args...).Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Could not open browser: %v\n", err)
	}
}
