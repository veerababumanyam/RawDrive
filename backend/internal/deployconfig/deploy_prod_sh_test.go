package deployconfig

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// deployProdScriptPath resolves deploy/scripts/deploy-prod.sh relative to this
// test file, independent of the test's working directory. This file lives at
// backend/internal/deployconfig/, so the repo root is three directories up.
func deployProdScriptPath(t *testing.T) string {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed; cannot locate deploy-prod.sh")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(thisFile), "..", "..", ".."))
	return filepath.Join(repoRoot, "deploy", "scripts", "deploy-prod.sh")
}

func readDeployProdScript(t *testing.T) string {
	t.Helper()
	path := deployProdScriptPath(t)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read deploy-prod.sh at %s: %v", path, err)
	}
	return string(data)
}

// TestF080_DeployProdDoesNotDisableHostKeyChecking is the regression guard for
// F-080. deploy-prod.sh streams a source tarball over SSH and builds the prod
// Docker images from it on the VPS. With StrictHostKeyChecking=no, a MITM on
// the SSH path could tamper with the streamed tarball and inject code into the
// prod image with no warning surfaced. This test fails on the pre-fix script
// (which contained `StrictHostKeyChecking=no`) and passes on the hardened one.
func TestF080_DeployProdDoesNotDisableHostKeyChecking(t *testing.T) {
	script := readDeployProdScript(t)

	if strings.Contains(script, "StrictHostKeyChecking=no") {
		t.Errorf("deploy-prod.sh disables SSH host-key checking (StrictHostKeyChecking=no): " +
			"a MITM could inject code into the pushed tarball and into the prod image (F-080)")
	}
}

// TestF080_DeployProdEnforcesStrictHostKeyChecking asserts the positive
// hardening is in place: strict checking is enabled and backed by a pinned
// known-hosts file (otherwise strict checking is unusable and would be
// reverted to =no by operators).
func TestF080_DeployProdEnforcesStrictHostKeyChecking(t *testing.T) {
	script := readDeployProdScript(t)

	if !strings.Contains(script, "StrictHostKeyChecking=yes") {
		t.Error("deploy-prod.sh does not enforce StrictHostKeyChecking=yes (F-080)")
	}
	if !strings.Contains(script, "UserKnownHostsFile=") {
		t.Error("deploy-prod.sh enforces strict host-key checking but pins no UserKnownHostsFile (F-080)")
	}
}

// TestF080_DeployProdPushUsesHardenedSSH guards that the tarball push — the
// actual supply-chain sink — still routes through the single hardened $SSH
// command rather than a raw ssh invocation that would bypass the pinned
// known-hosts file.
func TestF080_DeployProdPushUsesHardenedSSH(t *testing.T) {
	script := readDeployProdScript(t)

	if !strings.Contains(script, `| $SSH "root@$ip"`) {
		t.Error("push_code no longer pipes the tarball stream through the hardened $SSH command (F-080)")
	}
}

// TestPreMigrationPgBackRestRunsAsPostgresOSUser guards the F-077 interaction
// between pg_hba.conf and deploy-time backup. The postgres DB role uses peer
// auth, so pgBackRest commands that connect as pg1-user=postgres must run as the
// postgres OS user inside the active primary container, not as docker exec's
// default root user.
func TestPreMigrationPgBackRestRunsAsPostgresOSUser(t *testing.T) {
	script := readDeployProdScript(t)

	required := []string{
		`docker exec -u postgres $(pg_primary_container) pgbackrest --stanza=rawdrive info`,
		`docker exec -u postgres $(pg_primary_container) pgbackrest --stanza=rawdrive --type=incr backup`,
	}
	for _, needle := range required {
		if !strings.Contains(script, needle) {
			t.Fatalf("deploy-prod.sh must run pgBackRest through %q so peer auth maps to the postgres DB role", needle)
		}
	}

	forbidden := []string{
		`docker exec deploy-postgres-1 pgbackrest`,
		`docker exec $(pg_primary_container) pgbackrest`,
	}
	for _, needle := range forbidden {
		if strings.Contains(script, needle) {
			t.Fatalf("deploy-prod.sh still has root-run pgBackRest command %q; peer auth will fail for pg1-user=postgres", needle)
		}
	}
}
