package ai

type modelPrice struct {
	InputPaisaPer1K  int64
	OutputPaisaPer1K int64
}

var pricingTable = map[string]modelPrice{
	"gemini-2.0-flash":   {InputPaisaPer1K: 6, OutputPaisaPer1K: 25},
	"gemini-1.5-flash":   {InputPaisaPer1K: 6, OutputPaisaPer1K: 25},
	"text-embedding-004": {InputPaisaPer1K: 1, OutputPaisaPer1K: 0},
	"gemini-1.5-pro":     {InputPaisaPer1K: 105, OutputPaisaPer1K: 420},
}

var defaultPrice = modelPrice{InputPaisaPer1K: 25, OutputPaisaPer1K: 100}

// EstimateCost returns the cost in paisa for a Gemini API call.
// Uses integer ceiling arithmetic to avoid floating point drift.
func EstimateCost(model string, inputTokens, outputTokens int64) int64 {
	p, ok := pricingTable[model]
	if !ok {
		p = defaultPrice
	}
	var inputCost, outputCost int64
	if inputTokens > 0 {
		inputCost = (inputTokens*p.InputPaisaPer1K + 999) / 1000
	}
	if outputTokens > 0 {
		outputCost = (outputTokens*p.OutputPaisaPer1K + 999) / 1000
	}
	return inputCost + outputCost
}
