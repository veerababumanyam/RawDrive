package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestAmountInWords(t *testing.T) {
	tests := []struct {
		name     string
		paisa    int64
		expected string
	}{
		{
			"zero",
			0,
			"Rupees Zero Only",
		},
		{
			"one rupee (100 paisa)",
			100,
			"Rupees One Only",
		},
		{
			"ten rupees",
			1000,
			"Rupees Ten Only",
		},
		{
			"one hundred rupees",
			10000,
			"Rupees One Hundred Only",
		},
		{
			"one thousand rupees",
			100000,
			"Rupees One Thousand Only",
		},
		{
			"1,47,500 (one lakh forty-seven thousand five hundred)",
			14750000,
			"Rupees One Lakh Forty-Seven Thousand Five Hundred Only",
		},
		{
			"10 lakh",
			100000000,
			"Rupees Ten Lakh Only",
		},
		{
			"1 crore",
			1000000000,
			"Rupees One Crore Only",
		},
		{
			"99 crore 99 lakh 99 thousand 9 hundred 99",
			99999999900,
			"Rupees Ninety-Nine Crore Ninety-Nine Lakh Ninety-Nine Thousand Nine Hundred Ninety-Nine Only",
		},
		{
			"with paisa - 1 rupee 50 paise",
			150,
			"Rupees One and Fifty Paise Only",
		},
		{
			"paisa only - 75 paise",
			75,
			"Rupees Seventy-Five Paise Only",
		},
		{
			"complex with paisa",
			1234567,
			"Rupees Twelve Thousand Three Hundred Forty-Five and Sixty-Seven Paise Only",
		},
		{
			"negative amount returns absolute",
			-14750000,
			"Rupees One Lakh Forty-Seven Thousand Five Hundred Only",
		},
		{
			"eleven",
			1100,
			"Rupees Eleven Only",
		},
		{
			"twenty",
			2000,
			"Rupees Twenty Only",
		},
		{
			"twenty-one",
			2100,
			"Rupees Twenty-One Only",
		},
		{
			"one lakh",
			10000000,
			"Rupees One Lakh Only",
		},
		{
			"5 crore 25 lakh 10 thousand 3 hundred 15",
			5251031500,
			"Rupees Five Crore Twenty-Five Lakh Ten Thousand Three Hundred Fifteen Only",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := AmountInWords(tt.paisa)
			assert.Equal(t, tt.expected, result)
		})
	}
}
