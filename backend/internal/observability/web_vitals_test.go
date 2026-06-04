package observability

import (
	"strings"
	"testing"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"
)

func TestWebVitalsMetrics_ObserveRecordsSample(t *testing.T) {
	m := NewWebVitalsMetrics()

	reg := prometheus.NewRegistry()
	if err := reg.Register(m); err != nil {
		t.Fatalf("register web vitals collector: %v", err)
	}

	m.Observe("LCP", "/galleries/[id]", 1800)
	m.Observe("CLS", "/galleries/[id]", 0.05)

	// One sample landed in the LCP/(galleries) series, one in CLS.
	if got := testutil.CollectAndCount(reg, "rawdrive_web_vitals"); got == 0 {
		t.Fatalf("expected rawdrive_web_vitals samples, collected %d", got)
	}

	dump, err := metricsDump(reg)
	if err != nil {
		t.Fatalf("gather: %v", err)
	}
	for _, want := range []string{
		`rawdrive_web_vitals_count{metric="LCP",route="/galleries/[id]"} 1`,
		`rawdrive_web_vitals_count{metric="CLS",route="/galleries/[id]"} 1`,
		`rawdrive_web_vitals_sum{metric="LCP",route="/galleries/[id]"} 1800`,
	} {
		if !strings.Contains(dump, want) {
			t.Errorf("metrics dump missing %q\n---\n%s", want, dump)
		}
	}
}

func TestIsCanonicalWebVitalName(t *testing.T) {
	for _, name := range []string{"LCP", "INP", "CLS", "FCP", "TTFB", "FID"} {
		if !IsCanonicalWebVitalName(name) {
			t.Errorf("%q should be canonical", name)
		}
	}
	for _, name := range []string{"", "lcp", "EVIL", "../etc/passwd", "LCP "} {
		if IsCanonicalWebVitalName(name) {
			t.Errorf("%q must not be accepted", name)
		}
	}
}

// metricsDump renders the registry in Prometheus text format for substring
// assertions.
func metricsDump(reg *prometheus.Registry) (string, error) {
	mfs, err := reg.Gather()
	if err != nil {
		return "", err
	}
	var b strings.Builder
	for _, mf := range mfs {
		for _, mtr := range mf.GetMetric() {
			labels := mtr.GetLabel()
			var lp []string
			for _, l := range labels {
				lp = append(lp, l.GetName()+`="`+l.GetValue()+`"`)
			}
			labelStr := ""
			if len(lp) > 0 {
				labelStr = "{" + strings.Join(lp, ",") + "}"
			}
			if h := mtr.GetHistogram(); h != nil {
				b.WriteString(mf.GetName() + "_count" + labelStr + " ")
				b.WriteString(itoa(int64(h.GetSampleCount())))
				b.WriteString("\n")
				b.WriteString(mf.GetName() + "_sum" + labelStr + " ")
				b.WriteString(ftoa(h.GetSampleSum()))
				b.WriteString("\n")
			}
		}
	}
	return b.String(), nil
}

func itoa(v int64) string {
	if v == 0 {
		return "0"
	}
	neg := v < 0
	if neg {
		v = -v
	}
	var buf [20]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	s := string(buf[i:])
	if neg {
		return "-" + s
	}
	return s
}

func ftoa(v float64) string {
	// Tests only assert integer-valued sums (1800), so a simple integer render
	// is enough and avoids float formatting noise.
	return itoa(int64(v))
}
