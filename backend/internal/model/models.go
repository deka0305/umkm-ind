package model

type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

type Category struct {
	ID   string `json:"id" db:"id"`
	Name string `json:"name" db:"name"`
}

type Menu struct {
	ID         string  `json:"id" db:"id"`
	Name       string  `json:"name" db:"name"`
	CategoryID string  `json:"category_id" db:"category_id"`
	SellPrice  float64 `json:"sell_price" db:"sell_price"`
	HPP        float64 `json:"hpp" db:"hpp"`
	IsActive   bool    `json:"is_active" db:"is_active"`
	Stock      int     `json:"stock" db:"stock"`
	CreatedAt  string  `json:"created_at" db:"created_at"`
}

type HPPIngredient struct {
	ID             string  `json:"id" db:"id"`
	MenuID         string  `json:"menu_id" db:"menu_id"`
	IngredientName string  `json:"ingredient_name" db:"ingredient_name"`
	Qty            float64 `json:"qty" db:"qty"`
	Unit           string  `json:"unit" db:"unit"`
	PricePerUnit   float64 `json:"price_per_unit" db:"price_per_unit"`
}

type HPPProductionCost struct {
	ID           string  `json:"id" db:"id"`
	MenuID       string  `json:"menu_id" db:"menu_id"`
	GasCost      float64 `json:"gas_cost" db:"gas_cost"`
	PackagingCost float64 `json:"packaging_cost" db:"packaging_cost"`
	OtherCost    float64 `json:"other_cost" db:"other_cost"`
}

type HPPCalculationRequest struct {
	Ingredients     []HPPIngredient   `json:"ingredients"`
	ProductionCosts HPPProductionCost `json:"production_costs"`
}

type HPPCalculationResult struct {
	HPPPerPortion     float64            `json:"hpp_per_portion"`
	IngredientsTotal  float64            `json:"ingredients_total"`
	ProductionTotal   float64            `json:"production_total"`
	Breakdown         []HPPIngredient    `json:"breakdown"`
}

type HargaJualRequest struct {
	HPP             float64 `json:"hpp"`
	OverheadBulanan float64 `json:"overhead_bulanan"`
	EstimasiQty     float64 `json:"estimasi_qty"`
	MarginTarget    float64 `json:"margin_target"`
}

type HargaJualResult struct {
	HargaModal        float64 `json:"harga_modal"`
	HargaJual         float64 `json:"harga_jual"`
	ProfitPerPorsi    float64 `json:"profit_per_porsi"`
	MarginAktual      float64 `json:"margin_aktual"`
	HargaMinimal      float64 `json:"harga_minimal"`
	HargaIdeal        float64 `json:"harga_ideal"`
	HargaPremium      float64 `json:"harga_premium"`
}

type BEPRequest struct {
	HargaJual  float64 `json:"harga_jual"`
	HPP        float64 `json:"hpp"`
	BiayaTetap float64 `json:"biaya_tetap"`
}

type BEPResult struct {
	BEPUnit     float64            `json:"bep_unit"`
	BEPRupiah   float64            `json:"bep_rupiah"`
	Skenario    []SkenarioProfit   `json:"skenario"`
}

type SkenarioProfit struct {
	Label  string  `json:"label"`
	Qty    float64 `json:"qty"`
	Profit float64 `json:"profit"`
}

type Ingredient struct {
	ID           string  `json:"id" db:"id"`
	Name         string  `json:"name" db:"name"`
	Category     string  `json:"category" db:"category"`
	CurrentStock float64 `json:"current_stock" db:"current_stock"`
	Unit         string  `json:"unit" db:"unit"`
	MinStock     float64 `json:"min_stock" db:"min_stock"`
}

type StockMovement struct {
	ID           string  `json:"id" db:"id"`
	IngredientID string  `json:"ingredient_id" db:"ingredient_id"`
	Type         string  `json:"type" db:"type"`
	Qty          float64 `json:"qty" db:"qty"`
	Note         string  `json:"note" db:"note"`
	CreatedAt    string  `json:"created_at" db:"created_at"`
}

type Customer struct {
	ID          string  `json:"id" db:"id"`
	Name        string  `json:"name" db:"name"`
	Phone       string  `json:"phone" db:"phone"`
	MemberTier  string  `json:"member_tier" db:"member_tier"`
	TotalOrders int     `json:"total_orders" db:"total_orders"`
	TotalSpent  float64 `json:"total_spent" db:"total_spent"`
}

type Order struct {
	ID            string      `json:"id" db:"id"`
	CustomerID    string      `json:"customer_id" db:"customer_id"`
	TableNo       string      `json:"table_no" db:"table_no"`
	Status        string      `json:"status" db:"status"`
	PaymentMethod string      `json:"payment_method" db:"payment_method"`
	Subtotal      float64     `json:"subtotal" db:"subtotal"`
	Tax           float64     `json:"tax" db:"tax"`
	Discount      float64     `json:"discount" db:"discount"`
	Total         float64     `json:"total" db:"total"`
	Note          string      `json:"note" db:"note"`
	Items         []OrderItem `json:"items,omitempty"`
	CreatedAt     string      `json:"created_at" db:"created_at"`
}

type OrderItem struct {
	ID       string  `json:"id" db:"id"`
	OrderID  string  `json:"order_id" db:"order_id"`
	MenuID   string  `json:"menu_id" db:"menu_id"`
	Qty      int     `json:"qty" db:"qty"`
	Price    float64 `json:"price" db:"price"`
	Subtotal float64 `json:"subtotal" db:"subtotal"`
}

type Booking struct {
	ID          string `json:"id" db:"id"`
	CustomerID  string `json:"customer_id" db:"customer_id"`
	BookingDate string `json:"booking_date" db:"booking_date"`
	Time        string `json:"time" db:"time"`
	Guests      int    `json:"guests" db:"guests"`
	TableType   string `json:"table_type" db:"table_type"`
	Purpose     string `json:"purpose" db:"purpose"`
	Status      string `json:"status" db:"status"`
}

type PurchaseOrder struct {
	ID           string   `json:"id" db:"id"`
	SupplierName string   `json:"supplier_name" db:"supplier_name"`
	Status       string   `json:"status" db:"status"`
	Total        float64  `json:"total" db:"total"`
	Items        []POItem `json:"items,omitempty"`
	CreatedAt    string   `json:"created_at" db:"created_at"`
}

type POItem struct {
	ID           string  `json:"id" db:"id"`
	POID         string  `json:"po_id" db:"po_id"`
	IngredientID string  `json:"ingredient_id" db:"ingredient_id"`
	Qty          float64 `json:"qty" db:"qty"`
	Unit         string  `json:"unit" db:"unit"`
	Price        float64 `json:"price" db:"price"`
}
