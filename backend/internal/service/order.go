package service

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"umkm-pro/internal/model"
)

type OrderService struct {
	DB *sql.DB
}

func NewOrderService(db *sql.DB) *OrderService {
	return &OrderService{DB: db}
}

func (s *OrderService) CreateOrder(order model.Order) (model.Order, error) {
	order.ID = uuid.New().String()
	order.Status = "pending"
	order.CreatedAt = time.Now().Format(time.RFC3339)
	order.Subtotal = 0
	for _, item := range order.Items {
		order.Subtotal += item.Subtotal
	}
	order.Tax = order.Subtotal * 0.11
	order.Total = order.Subtotal + order.Tax - order.Discount

	tx, err := s.DB.Begin()
	if err != nil {
		return order, fmt.Errorf("OrderService.CreateOrder: %w", err)
	}
	defer tx.Rollback()

	_, err = tx.Exec(
		`INSERT INTO orders (id, customer_id, table_no, status, payment_method, subtotal, tax, discount, total, note, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		order.ID, order.CustomerID, order.TableNo, order.Status, order.PaymentMethod,
		order.Subtotal, order.Tax, order.Discount, order.Total, order.Note, order.CreatedAt,
	)
	if err != nil {
		return order, fmt.Errorf("OrderService.CreateOrder insert order: %w", err)
	}

	for i, item := range order.Items {
		item.ID = uuid.New().String()
		item.OrderID = order.ID
		item.Subtotal = float64(item.Qty) * item.Price
		order.Items[i] = item
		_, err = tx.Exec(
			`INSERT INTO order_items (id, order_id, menu_id, qty, price, subtotal) VALUES (?, ?, ?, ?, ?, ?)`,
			item.ID, item.OrderID, item.MenuID, item.Qty, item.Price, item.Subtotal,
		)
		if err != nil {
			return order, fmt.Errorf("OrderService.CreateOrder insert item: %w", err)
		}
	}

	if err = tx.Commit(); err != nil {
		return order, fmt.Errorf("OrderService.CreateOrder commit: %w", err)
	}
	return order, nil
}

func (s *OrderService) GetOrders(limit, offset int) ([]model.Order, error) {
	rows, err := s.DB.Query(
		`SELECT id, customer_id, table_no, status, payment_method, subtotal, tax, discount, total, note, created_at
		 FROM orders ORDER BY created_at DESC LIMIT ? OFFSET ?`, limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("OrderService.GetOrders: %w", err)
	}
	defer rows.Close()

	var orders []model.Order
	for rows.Next() {
		var o model.Order
		if err := rows.Scan(&o.ID, &o.CustomerID, &o.TableNo, &o.Status, &o.PaymentMethod,
			&o.Subtotal, &o.Tax, &o.Discount, &o.Total, &o.Note, &o.CreatedAt); err != nil {
			return nil, fmt.Errorf("OrderService.GetOrders scan: %w", err)
		}
		orders = append(orders, o)
	}
	return orders, nil
}

func (s *OrderService) UpdateOrderStatus(id, status string) error {
	_, err := s.DB.Exec(`UPDATE orders SET status = ? WHERE id = ?`, status, id)
	if err != nil {
		return fmt.Errorf("OrderService.UpdateOrderStatus: %w", err)
	}
	return nil
}
