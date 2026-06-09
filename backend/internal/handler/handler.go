package handler

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"umkm-pro/internal/model"
	"umkm-pro/internal/service"
)

type Handler struct {
	OrderSvc  *service.OrderService
	StokSvc   *service.StokService
	LaporanSvc *service.LaporanService
	DB        *sql.DB
}

func NewHandler(db *sql.DB) *Handler {
	return &Handler{
		OrderSvc:   service.NewOrderService(db),
		StokSvc:    service.NewStokService(db),
		LaporanSvc: service.NewLaporanService(db),
		DB:         db,
	}
}

func ok(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, model.APIResponse{Success: true, Data: data})
}

func fail(c *gin.Context, code int, msg string) {
	c.JSON(code, model.APIResponse{Success: false, Error: msg})
}

func (h *Handler) GetDashboard(c *gin.Context) {
	summary, err := h.LaporanSvc.GetDashboard()
	if err != nil {
		fail(c, 500, err.Error())
		return
	}
	ok(c, summary)
}

func (h *Handler) GetMenus(c *gin.Context) {
	rows, err := h.DB.Query(`SELECT id, name, category_id, sell_price, hpp, is_active, stock, created_at FROM menus ORDER BY name`)
	if err != nil {
		fail(c, 500, err.Error())
		return
	}
	defer rows.Close()
	var menus []model.Menu
	for rows.Next() {
		var m model.Menu
		var isActive int
		rows.Scan(&m.ID, &m.Name, &m.CategoryID, &m.SellPrice, &m.HPP, &isActive, &m.Stock, &m.CreatedAt)
		m.IsActive = isActive == 1
		menus = append(menus, m)
	}
	ok(c, menus)
}

func (h *Handler) GetCategories(c *gin.Context) {
	rows, err := h.DB.Query(`SELECT id, name FROM categories ORDER BY name`)
	if err != nil {
		fail(c, 500, err.Error())
		return
	}
	defer rows.Close()
	var cats []model.Category
	for rows.Next() {
		var cat model.Category
		rows.Scan(&cat.ID, &cat.Name)
		cats = append(cats, cat)
	}
	ok(c, cats)
}

func (h *Handler) CreateOrder(c *gin.Context) {
	var order model.Order
	if err := c.ShouldBindJSON(&order); err != nil {
		fail(c, 400, "input tidak valid: "+err.Error())
		return
	}
	created, err := h.OrderSvc.CreateOrder(order)
	if err != nil {
		fail(c, 500, err.Error())
		return
	}
	ok(c, created)
}

func (h *Handler) GetOrders(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	orders, err := h.OrderSvc.GetOrders(limit, offset)
	if err != nil {
		fail(c, 500, err.Error())
		return
	}
	ok(c, orders)
}

func (h *Handler) UpdateOrderStatus(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		Status string `json:"status"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		fail(c, 400, "input tidak valid")
		return
	}
	if err := h.OrderSvc.UpdateOrderStatus(id, body.Status); err != nil {
		fail(c, 500, err.Error())
		return
	}
	ok(c, gin.H{"updated": true})
}

func (h *Handler) GetIngredients(c *gin.Context) {
	items, err := h.StokSvc.GetIngredients()
	if err != nil {
		fail(c, 500, err.Error())
		return
	}
	ok(c, items)
}

func (h *Handler) CreateIngredient(c *gin.Context) {
	var ing model.Ingredient
	if err := c.ShouldBindJSON(&ing); err != nil {
		fail(c, 400, "input tidak valid")
		return
	}
	created, err := h.StokSvc.CreateIngredient(ing)
	if err != nil {
		fail(c, 500, err.Error())
		return
	}
	ok(c, created)
}

func (h *Handler) AddStockMovement(c *gin.Context) {
	var mov model.StockMovement
	if err := c.ShouldBindJSON(&mov); err != nil {
		fail(c, 400, "input tidak valid")
		return
	}
	if err := h.StokSvc.AddStockMovement(mov); err != nil {
		fail(c, 500, err.Error())
		return
	}
	ok(c, gin.H{"updated": true})
}

func (h *Handler) UpdateIngredient(c *gin.Context) {
	id := c.Param("id")
	var ing model.Ingredient
	if err := c.ShouldBindJSON(&ing); err != nil {
		fail(c, 400, "input tidak valid")
		return
	}
	ing.ID = id
	if err := h.StokSvc.UpdateIngredient(ing); err != nil {
		fail(c, 500, err.Error())
		return
	}
	ok(c, ing)
}

func (h *Handler) DeleteIngredient(c *gin.Context) {
	id := c.Param("id")
	_, err := h.DB.Exec(`DELETE FROM ingredients WHERE id = ?`, id)
	if err != nil {
		fail(c, 500, err.Error())
		return
	}
	ok(c, gin.H{"deleted": true})
}

func (h *Handler) HitungHPP(c *gin.Context) {
	var req model.HPPCalculationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, "input tidak valid")
		return
	}
	result := service.HitungHPP(req)
	ok(c, result)
}

func (h *Handler) HitungHargaJual(c *gin.Context) {
	var req model.HargaJualRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, "input tidak valid")
		return
	}
	result := service.HitungHargaJual(req)
	ok(c, result)
}

func (h *Handler) HitungBEP(c *gin.Context) {
	var req model.BEPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, "input tidak valid")
		return
	}
	result := service.HitungBEP(req)
	ok(c, result)
}

func (h *Handler) GetLaporan(c *gin.Context) {
	start := c.DefaultQuery("start", "")
	end := c.DefaultQuery("end", "")
	if start == "" || end == "" {
		fail(c, 400, "parameter start dan end diperlukan")
		return
	}
	points, err := h.LaporanSvc.GetRevenuePeriod(start, end)
	if err != nil {
		fail(c, 500, err.Error())
		return
	}
	ok(c, points)
}

func (h *Handler) GetCustomers(c *gin.Context) {
	rows, err := h.DB.Query(`SELECT id, name, phone, member_tier, total_orders, total_spent FROM customers ORDER BY name`)
	if err != nil {
		fail(c, 500, err.Error())
		return
	}
	defer rows.Close()
	var customers []model.Customer
	for rows.Next() {
		var cust model.Customer
		rows.Scan(&cust.ID, &cust.Name, &cust.Phone, &cust.MemberTier, &cust.TotalOrders, &cust.TotalSpent)
		customers = append(customers, cust)
	}
	ok(c, customers)
}
