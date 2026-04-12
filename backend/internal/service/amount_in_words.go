package service

import "strings"

var ones = []string{
	"", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
	"Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
	"Seventeen", "Eighteen", "Nineteen",
}

var tens = []string{
	"", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
}

// twoDigitWords converts a number 0–99 to words.
func twoDigitWords(n int64) string {
	if n < 20 {
		return ones[n]
	}
	w := tens[n/10]
	if n%10 != 0 {
		w += "-" + ones[n%10]
	}
	return w
}

// indianNumberWords converts an integer (rupees part) to Indian English words.
// Indian numbering: ones, tens, hundreds, thousands (up to 99), lakhs (up to 99), crores (up to 99).
func indianNumberWords(n int64) string {
	if n == 0 {
		return ""
	}

	var parts []string

	// Crores (10^7)
	if n >= 10000000 {
		crores := n / 10000000
		parts = append(parts, twoDigitWords(crores)+" Crore")
		n %= 10000000
	}

	// Lakhs (10^5)
	if n >= 100000 {
		lakhs := n / 100000
		parts = append(parts, twoDigitWords(lakhs)+" Lakh")
		n %= 100000
	}

	// Thousands (10^3)
	if n >= 1000 {
		thousands := n / 1000
		parts = append(parts, twoDigitWords(thousands)+" Thousand")
		n %= 1000
	}

	// Hundreds
	if n >= 100 {
		hundreds := n / 100
		parts = append(parts, ones[hundreds]+" Hundred")
		n %= 100
	}

	// Remaining (0–99)
	if n > 0 {
		parts = append(parts, twoDigitWords(n))
	}

	return strings.Join(parts, " ")
}

// AmountInWords converts paisa (1/100 of a rupee) to Indian English words.
//
// Example: 14750000 paisa → "Rupees One Lakh Forty-Seven Thousand Five Hundred Only"
//
// Uses Indian numbering: ones, tens, hundreds, thousands, lakhs, crores.
// Always starts with "Rupees" and ends with "Only".
// For zero: "Rupees Zero Only"
// For amounts with paisa remainder: "Rupees X and Y Paise Only"
func AmountInWords(paisa int64) string {
	if paisa < 0 {
		paisa = -paisa
	}

	rupees := paisa / 100
	paisaRem := paisa % 100

	if rupees == 0 && paisaRem == 0 {
		return "Rupees Zero Only"
	}

	var result strings.Builder
	result.WriteString("Rupees ")

	if rupees > 0 {
		result.WriteString(indianNumberWords(rupees))
	}

	if paisaRem > 0 {
		if rupees > 0 {
			result.WriteString(" and ")
		}
		result.WriteString(twoDigitWords(paisaRem))
		result.WriteString(" Paise")
	}

	result.WriteString(" Only")
	return result.String()
}
