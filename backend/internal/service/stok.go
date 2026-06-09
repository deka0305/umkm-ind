package service

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"umkm-pro/internal/model"
)

type StokService struct {
	DB *sql.DB
}

func NewStokService(db *sql.DB) *StokService {
	return &StokService{DB: db}
}

func (s *StokService) GetIngredients() ([]model.Ingredient, error) {
	rows, err := s.DB.Query(`SELECT id, name, category, current_stock, unit, min_stock FROM ingredients ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("StokService.GetIngredients: %w", err)
	}
	defer rows.Close()
	var items []model.Ingredient
	for rows.Next() {
		var i model.Ingredient
		if err := rows.Scan(&i.ID, &i.Name, &i.Category, &i.CurrentStock, &i.Unit, &i.MinStock); err != nil {
			return nil, fmt.Errorf("StokService.GetIngredients scan: %w", err)
		}
		items = append(items, i)
	}
	return items, nil
}

func (s *StokService) CreateIngredient(ing model.Ingredient) (model.Ingredient, error) {
	ing.ID = uuid.New().String()
	_, err := s.DB.Exec(
		`INSERT INTO ingredients (id, name, category, current_stock, unit, min_stock) VALUES (?, ?, ?, ?, ?, ?)`,
		ing.ID, ing.Name, ing.Category, ing.CurrentStock, ing.Unit, ing.MinStock,
	)
	if err != nil {
		return ing, fmt.Errorf("StokService.CreateIngredient: %w", err)
	}
	return ing, nil
}

func (s *StokService) UpdateIngredient(ing model.Ingredient) error {
	_, err := s.DB.Exec(
		`UPDATE ingredients SET name=?, category=?, current_stock=?, unit=?, min_stock=? WHERE id=?`,
		ing.Name, ing.Category, ing.CurrentStock, ing.Unit, ing.MinStock, ing.ID,
	)
	if err != nil {
		return fmt.Errorf("StokService.UpdateIngredient: %w", err)
	}
	return nil
}

func (s *StokService) AddStockMovement(mov model.StockMovement) error {
	mov.ID = uuid.New().String()
	mov.CreatedAt = time.Now().Format(time.RFC3339)
	tx, err := s.DB.Begin()
	if err != nil {
		return fmt.Errorf("StokService.AddStockMovement: %w", err)
	}
	defer tx.Rollback()
	_, err = tx.Exec(
		`INSERT INTO stock_movements (id, ingredient_id, type, qty, note, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		mov.ID, mov.IngredientID, mov.Type, mov.Qty, mov.Note, mov.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("StokService.AddStockMovement insert: %w", err)
	}
	delta := mov.Qty
	if mov.Type == "keluar" {
		delta = -delta
	}
	_, err = tx.Exec(`UPDATE ingredients SET current_stock = current_stock + ? WHERE id = ?`, delta, mov.IngredientID)
	if err != nil {
		return fmt.Errorf("StokService.AddStockMovement update: %w", err)
	}
	return tx.Commit()
}

func (s *StokService) GetLowStock() ([]model.Ingredient, error) {
	rows, err := s.DB.Query(`SELECT id, name, category, current_stock, unit, min_stock FROM ingredients WHERE current_stock <= min_stock ORDER BY current_stock ASC`)
	if err != nil {
		return nil, fmt.Errorf("StokService.GetLowStock: %w", err)
	}
	defer rows.Close()
	var items []model.Ingredient
	for rows.Next() {
		var i model.Ingredient
		rows.Scan(&i.ID, &i.Name, &i.Category, &i.CurrentStock, &i.Unit, &i.MinStock)
		items = append(items, i)
	}
	return items, nil
}
