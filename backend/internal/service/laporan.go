package service

import (
	"database/sql"
	"fmt"

	"umkm-pro/internal/model"
)

type LaporanService struct {
	DB *sql.DB
}

func NewLaporanService(db *sql.DB) *LaporanService {
	return &LaporanService{DB: db}
}

type DashboardSummary struct {
	TotalOrderHariIni int               `json:"total_order_hari_ini"`
	PendapatanHariIni float64           `json:"pendapatan_hari_ini"`
	StokKritis        []model.Ingredient `json:"stok_kritis"`
	OrderTerbaru      []model.Order      `json:"order_terbaru"`
}

func (s *LaporanService) GetDashboard() (DashboardSummary, error) {
	var summary DashboardSummary

	err := s.DB.QueryRow(
		`SELECT COUNT(*), COALESCE(SUM(total),0) FROM orders WHERE date(created_at) = date('now') AND status = 'selesai'`,
	).Scan(&summary.TotalOrderHariIni, &summary.PendapatanHariIni)
	if err != nil && err != sql.ErrNoRows {
		return summary, fmt.Errorf("LaporanService.GetDashboard orders: %w", err)
	}

	rows, err := s.DB.Query(
		`SELECT id, name, category, current_stock, unit, min_stock FROM ingredients WHERE current_stock <= min_stock ORDER BY current_stock ASC LIMIT 5`,
	)
	if err != nil {
		return summary, fmt.Errorf("LaporanService.GetDashboard stok: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var i model.Ingredient
		rows.Scan(&i.ID, &i.Name, &i.Category, &i.CurrentStock, &i.Unit, &i.MinStock)
		summary.StokKritis = append(summary.StokKritis, i)
	}

	orderRows, err := s.DB.Query(
		`SELECT id, customer_id, table_no, status, payment_method, subtotal, tax, discount, total, note, created_at FROM orders ORDER BY created_at DESC LIMIT 5`,
	)
	if err != nil {
		return summary, fmt.Errorf("LaporanService.GetDashboard recent orders: %w", err)
	}
	defer orderRows.Close()
	for orderRows.Next() {
		var o model.Order
		orderRows.Scan(&o.ID, &o.CustomerID, &o.TableNo, &o.Status, &o.PaymentMethod,
			&o.Subtotal, &o.Tax, &o.Discount, &o.Total, &o.Note, &o.CreatedAt)
		summary.OrderTerbaru = append(summary.OrderTerbaru, o)
	}
	return summary, nil
}

type RevenuePoint struct {
	Tanggal  string  `json:"tanggal"`
	Revenue  float64 `json:"revenue"`
	JmlOrder int     `json:"jml_order"`
}

func (s *LaporanService) GetRevenuePeriod(startDate, endDate string) ([]RevenuePoint, error) {
	rows, err := s.DB.Query(
		`SELECT date(created_at) as tgl, COALESCE(SUM(total),0), COUNT(*) FROM orders
		 WHERE status='selesai' AND date(created_at) BETWEEN ? AND ?
		 GROUP BY tgl ORDER BY tgl`,
		startDate, endDate,
	)
	if err != nil {
		return nil, fmt.Errorf("LaporanService.GetRevenuePeriod: %w", err)
	}
	defer rows.Close()
	var points []RevenuePoint
	for rows.Next() {
		var p RevenuePoint
		rows.Scan(&p.Tanggal, &p.Revenue, &p.JmlOrder)
		points = append(points, p)
	}
	return points, nil
}
