package main

import (
	"database/sql"
	"log"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	_ "github.com/mattn/go-sqlite3"
	"umkm-pro/internal/handler"
)

func main() {
	godotenv.Load()

	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./umkm.db"
	}

	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		log.Fatalf("gagal membuka database: %v", err)
	}
	defer db.Close()

	if err := runMigrations(db); err != nil {
		log.Fatalf("gagal migrasi: %v", err)
	}

	h := handler.NewHandler(db)

	r := gin.Default()
	r.Use(corsMiddleware())

	api := r.Group("/api/v1")
	{
		api.GET("/dashboard", h.GetDashboard)

		api.GET("/menus", h.GetMenus)
		api.GET("/categories", h.GetCategories)

		api.GET("/orders", h.GetOrders)
		api.POST("/orders", h.CreateOrder)
		api.PATCH("/orders/:id/status", h.UpdateOrderStatus)

		api.GET("/ingredients", h.GetIngredients)
		api.POST("/ingredients", h.CreateIngredient)
		api.PUT("/ingredients/:id", h.UpdateIngredient)
		api.DELETE("/ingredients/:id", h.DeleteIngredient)
		api.POST("/stock-movements", h.AddStockMovement)

		api.POST("/hpp/hitung", h.HitungHPP)
		api.POST("/hpp/harga-jual", h.HitungHargaJual)
		api.POST("/hpp/bep", h.HitungBEP)

		api.GET("/laporan", h.GetLaporan)
		api.GET("/customers", h.GetCustomers)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Server berjalan di port %s", port)
	r.Run(":" + port)
}

func runMigrations(db *sql.DB) error {
	migration, err := os.ReadFile("migrations/001_init.sql")
	if err != nil {
		return err
	}
	_, err = db.Exec(string(migration))
	return err
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}
