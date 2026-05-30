// Package deploytest holds regression tests that guard deployment manifests
// (docker-compose files) against config regressions caught in audit.
//
// These tests parse the raw compose YAML with the standard library only — no
// external YAML dependency — so they never affect the production build's module
// graph. They are intentionally lightweight string/line assertions: the goal is
// to catch the specific audit findings below from silently regressing, not to
// fully validate Compose schema (that is `docker compose config`'s job).
package deploytest

import (
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"
)

// prodAppComposePath resolves deploy/docker-compose.prod-app.yml relative to
// this test file, independent of the test's working directory — matching the
// runtime.Caller pattern used by backend/internal/deployconfig. This file lives
// at backend/internal/deploytest/, so the repo root is three directories up.
func prodAppComposePath(t *testing.T) string {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed; cannot locate docker-compose.prod-app.yml")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(thisFile), "..", "..", ".."))
	return filepath.Join(repoRoot, "deploy", "docker-compose.prod-app.yml")
}

func readProdAppCompose(t *testing.T) string {
	t.Helper()
	p := prodAppComposePath(t)
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatalf("read %s: %v", p, err)
	}
	return string(b)
}

// topLevelServices returns the set of service names declared under the
// top-level `services:` block. It relies on the project's consistent 2-space
// indentation (service keys are indented exactly 2 spaces).
func topLevelServices(t *testing.T, content string) []string {
	t.Helper()
	lines := strings.Split(content, "\n")
	inServices := false
	var names []string
	svcKey := regexp.MustCompile(`^  ([a-z0-9][a-z0-9_-]*):\s*$`)
	for _, ln := range lines {
		trimmed := strings.TrimRight(ln, " \t")
		if trimmed == "services:" {
			inServices = true
			continue
		}
		if !inServices {
			continue
		}
		// A non-indented, non-empty, non-comment line ends the services block
		// (e.g. the top-level `volumes:` key).
		if trimmed != "" && !strings.HasPrefix(trimmed, " ") && !strings.HasPrefix(strings.TrimSpace(trimmed), "#") {
			break
		}
		if m := svcKey.FindStringSubmatch(ln); m != nil {
			names = append(names, m[1])
		}
	}
	return names
}

// serviceBlock returns the raw text of a single service's block: everything
// from the `  <name>:` line up to (but not including) the next top-level
// service key or the end of the services section.
func serviceBlock(t *testing.T, content, name string) string {
	t.Helper()
	lines := strings.Split(content, "\n")
	start := -1
	header := "  " + name + ":"
	for i, ln := range lines {
		if strings.TrimRight(ln, " \t") == header {
			start = i
			break
		}
	}
	if start == -1 {
		t.Fatalf("service %q not found in compose file", name)
	}
	svcKey := regexp.MustCompile(`^  [a-z0-9][a-z0-9_-]*:\s*$`)
	end := len(lines)
	for i := start + 1; i < len(lines); i++ {
		ln := lines[i]
		// Stop at the next 2-space service key.
		if svcKey.MatchString(ln) {
			end = i
			break
		}
		// Stop at any non-indented top-level key (e.g. `volumes:`).
		trimmed := strings.TrimRight(ln, " \t")
		if trimmed != "" && !strings.HasPrefix(ln, " ") {
			end = i
			break
		}
	}
	return strings.Join(lines[start:end], "\n")
}

// TestF114_NoMutableLatestImageTags asserts that no service in the production
// app compose file pins an image to the mutable `:latest` tag. A floating
// :latest can silently pull a new (or compromised) image on any --pull build.
func TestF114_NoMutableLatestImageTags(t *testing.T) {
	content := readProdAppCompose(t)
	latest := regexp.MustCompile(`(?m)^\s*image:\s*\S+:latest\s*$`)
	// Also catch a bare `image: foo` with no tag at all, which Docker treats
	// as :latest implicitly. Locally-built images use a fixed `:local` tag and
	// must remain allowed.
	imageLine := regexp.MustCompile(`(?m)^\s*image:\s*(\S+)\s*$`)

	if m := latest.FindAllString(content, -1); len(m) > 0 {
		t.Errorf("F-114 regression: found mutable :latest image tag(s): %v", m)
	}

	for _, m := range imageLine.FindAllStringSubmatch(content, -1) {
		ref := m[1]
		// A reference is acceptable if it has an explicit, non-latest tag
		// (contains ':' after the final '/') or a digest ('@sha256:').
		lastSlash := strings.LastIndex(ref, "/")
		nameAndTag := ref
		if lastSlash >= 0 {
			nameAndTag = ref[lastSlash+1:]
		}
		hasTag := strings.Contains(nameAndTag, ":")
		hasDigest := strings.Contains(ref, "@sha256:")
		if !hasTag && !hasDigest {
			t.Errorf("F-114 regression: image %q has no explicit tag (defaults to :latest)", ref)
		}
		if strings.HasSuffix(ref, ":latest") {
			t.Errorf("F-114 regression: image %q pinned to mutable :latest", ref)
		}
	}
}

// TestF116_AllServicesHaveResourceLimits asserts that every service in the
// production app compose file declares deploy.resources.limits.memory. Without
// a cap, a runaway container can OOM-kill the shared host (Postgres/Valkey),
// risking in-flight WAL corruption.
func TestF116_AllServicesHaveResourceLimits(t *testing.T) {
	content := readProdAppCompose(t)
	services := topLevelServices(t, content)
	if len(services) == 0 {
		t.Fatalf("parsed zero services from compose file — parser bug")
	}

	for _, svc := range services {
		block := serviceBlock(t, content, svc)
		hasDeploy := strings.Contains(block, "\n    deploy:")
		hasResources := strings.Contains(block, "resources:")
		hasLimits := strings.Contains(block, "limits:")
		hasMemLimit := regexp.MustCompile(`limits:\s*\n(?:\s+\S.*\n)*?\s+memory:\s*\S+`).MatchString(block)
		if !(hasDeploy && hasResources && hasLimits && hasMemLimit) {
			t.Errorf("F-116 regression: service %q is missing deploy.resources.limits.memory "+
				"(deploy=%v resources=%v limits=%v memoryUnderLimits=%v)",
				svc, hasDeploy, hasResources, hasLimits, hasMemLimit)
		}
	}
}
