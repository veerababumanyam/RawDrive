package service

import (
	"maps"
	"strings"
)

// GSTService handles Indian GST tax determination.
type GSTService struct{}

// NewGSTService creates a new GSTService.
func NewGSTService() *GSTService {
	return &GSTService{}
}

// indianStates maps 2-digit GSTIN state codes to state/UT names.
// Full list of 37 states and union territories per GSTIN specification.
var indianStates = map[string]string{
	"01": "Jammu and Kashmir",
	"02": "Himachal Pradesh",
	"03": "Punjab",
	"04": "Chandigarh",
	"05": "Uttarakhand",
	"06": "Haryana",
	"07": "Delhi",
	"08": "Rajasthan",
	"09": "Uttar Pradesh",
	"10": "Bihar",
	"11": "Sikkim",
	"12": "Arunachal Pradesh",
	"13": "Nagaland",
	"14": "Manipur",
	"15": "Mizoram",
	"16": "Tripura",
	"17": "Meghalaya",
	"18": "Assam",
	"19": "West Bengal",
	"20": "Jharkhand",
	"21": "Odisha",
	"22": "Chhattisgarh",
	"23": "Madhya Pradesh",
	"24": "Gujarat",
	"25": "Daman and Diu",
	"26": "Dadra and Nagar Haveli",
	"27": "Maharashtra",
	"28": "Andhra Pradesh",
	"29": "Karnataka",
	"30": "Goa",
	"31": "Lakshadweep",
	"32": "Kerala",
	"33": "Tamil Nadu",
	"34": "Puducherry",
	"35": "Andaman and Nicobar Islands",
	"36": "Telangana",
	"37": "Andhra Pradesh (New)",
	"38": "Ladakh",
}

// stateNameToCode is the reverse lookup (lowercase name → code).
var stateNameToCode map[string]string

func init() {
	stateNameToCode = make(map[string]string, len(indianStates))
	for code, name := range indianStates {
		stateNameToCode[strings.ToLower(name)] = code
	}
}

// DetermineGSTType takes the supplier's state code (first 2 digits of GSTIN)
// and the Place of Supply state code, and returns whether CGST+SGST or IGST applies.
// Returns "intra" (same state → CGST+SGST) or "inter" (different state → IGST).
// Returns empty string if either code is invalid.
func (s *GSTService) DetermineGSTType(supplierStateCode, placeOfSupplyCode string) string {
	if _, ok := indianStates[supplierStateCode]; !ok {
		return ""
	}
	if _, ok := indianStates[placeOfSupplyCode]; !ok {
		return ""
	}
	if supplierStateCode == placeOfSupplyCode {
		return "intra"
	}
	return "inter"
}

// GetStateByCode returns the state name for a given 2-digit code.
// Returns empty string if the code is not found.
func (s *GSTService) GetStateByCode(code string) string {
	return indianStates[code]
}

// GetCodeByState returns the 2-digit code for a given state name (case-insensitive).
// Returns empty string if the state name is not found.
func (s *GSTService) GetCodeByState(name string) string {
	return stateNameToCode[strings.ToLower(name)]
}

// AllStates returns a map of code→name for all Indian states/UTs.
func (s *GSTService) AllStates() map[string]string {
	result := make(map[string]string, len(indianStates))
	maps.Copy(result, indianStates)
	return result
}

// ExtractStateCodeFromGSTIN extracts the first 2 digits from a 15-character GSTIN.
// Returns empty string if the GSTIN is invalid (not 15 characters).
func (s *GSTService) ExtractStateCodeFromGSTIN(gstin string) string {
	if len(gstin) != 15 {
		return ""
	}
	return gstin[:2]
}
