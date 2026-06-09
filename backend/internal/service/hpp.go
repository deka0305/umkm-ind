package service

import "umkm-pro/internal/model"

func HitungHPP(req model.HPPCalculationRequest) model.HPPCalculationResult {
	var ingredientsTotal float64
	for _, ing := range req.Ingredients {
		ingredientsTotal += ing.Qty * ing.PricePerUnit
	}
	productionTotal := req.ProductionCosts.GasCost + req.ProductionCosts.PackagingCost + req.ProductionCosts.OtherCost
	hpp := ingredientsTotal + productionTotal
	return model.HPPCalculationResult{
		HPPPerPortion:    hpp,
		IngredientsTotal: ingredientsTotal,
		ProductionTotal:  productionTotal,
		Breakdown:        req.Ingredients,
	}
}

func HitungHargaJual(req model.HargaJualRequest) model.HargaJualResult {
	overheadPerPorsi := 0.0
	if req.EstimasiQty > 0 {
		overheadPerPorsi = req.OverheadBulanan / req.EstimasiQty
	}
	hargaModal := req.HPP + overheadPerPorsi
	margin := req.MarginTarget / 100
	if margin >= 1 {
		margin = 0.99
	}
	hargaJual := hargaModal / (1 - margin)
	profit := hargaJual - hargaModal
	marginAktual := 0.0
	if hargaJual > 0 {
		marginAktual = profit / hargaJual * 100
	}
	return model.HargaJualResult{
		HargaModal:     bulatkan(hargaModal, 500),
		HargaJual:      bulatkan(hargaJual, 1000),
		ProfitPerPorsi: profit,
		MarginAktual:   marginAktual,
		HargaMinimal:   bulatkan(hargaModal*(1+0.10), 500),
		HargaIdeal:     bulatkan(hargaJual, 1000),
		HargaPremium:   bulatkan(hargaJual*1.20, 5000),
	}
}

func HitungBEP(req model.BEPRequest) model.BEPResult {
	kontribusiMargin := req.HargaJual - req.HPP
	bepUnit := 0.0
	if kontribusiMargin > 0 {
		bepUnit = req.BiayaTetap / kontribusiMargin
	}
	bepRupiah := bepUnit * req.HargaJual
	skenario := []model.SkenarioProfit{
		{Label: "Pesimis", Qty: bepUnit * 0.7, Profit: (bepUnit*0.7*kontribusiMargin - req.BiayaTetap)},
		{Label: "Realistis", Qty: bepUnit * 1.0, Profit: 0},
		{Label: "Optimis", Qty: bepUnit * 1.3, Profit: (bepUnit * 0.3 * kontribusiMargin)},
		{Label: "Maksimal", Qty: bepUnit * 1.6, Profit: (bepUnit * 0.6 * kontribusiMargin)},
	}
	return model.BEPResult{
		BEPUnit:   bepUnit,
		BEPRupiah: bepRupiah,
		Skenario:  skenario,
	}
}

func bulatkan(harga float64, pembulatan float64) float64 {
	return float64(int((harga+pembulatan/2)/pembulatan)) * pembulatan
}
