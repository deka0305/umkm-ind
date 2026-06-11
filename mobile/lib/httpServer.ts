/**
 * Local HTTP server agar device lain di jaringan WiFi/hotspot bisa
 * mengakses UMKM Pro via browser tanpa install app.
 *
 * Berjalan di port 3000. Sediakan:
 *  GET  /             → Web UI (dashboard, order, stok)
 *  GET  /api/dashboard
 *  GET  /api/menus
 *  GET  /api/orders
 *  POST /api/orders
 *  GET  /api/ingredients
 *  PATCH /api/orders/:id/status
 */

import { Platform } from 'react-native';
import { getDB, generateId } from './db';
import { notifyDataChange } from './sync';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HTTPRequest {
  method: string;
  url: string;
  pathname: string;
  headers: Record<string, string>;
  body: string;
}

// ─── State ────────────────────────────────────────────────────────────────────

let _server: any = null;
let _port = 3333;

// ─── HTTP Utilities ───────────────────────────────────────────────────────────

function parseRequest(raw: string): HTTPRequest | null {
  try {
    const sepIdx = raw.indexOf('\r\n\r\n');
    const headerSection = sepIdx >= 0 ? raw.substring(0, sepIdx) : raw;
    const body = sepIdx >= 0 ? raw.substring(sepIdx + 4) : '';
    const lines = headerSection.split('\r\n');
    if (!lines[0]) return null;

    const parts = lines[0].split(' ');
    const method = parts[0] || 'GET';
    const url = parts[1] || '/';
    const pathname = url.split('?')[0];

    const headers: Record<string, string> = {};
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].indexOf(':');
      if (c > 0) {
        headers[lines[i].substring(0, c).toLowerCase()] = lines[i].substring(c + 1).trim();
      }
    }
    return { method, url, pathname, headers, body };
  } catch {
    return null;
  }
}

function respond(socket: any, statusCode: number, contentType: string, body: string): void {
  const statusText: Record<number, string> = {
    200: 'OK', 201: 'Created', 204: 'No Content',
    400: 'Bad Request', 404: 'Not Found', 405: 'Method Not Allowed',
    500: 'Internal Server Error',
  };
  const headers = [
    'HTTP/1.1 ' + statusCode + ' ' + (statusText[statusCode] || 'Unknown'),
    'Content-Type: ' + contentType + '; charset=utf-8',
    'Access-Control-Allow-Origin: *',
    'Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers: Content-Type',
    'Connection: close',
    '',
    '',
  ].join('\r\n');
  try {
    socket.write(headers + body, 'utf-8', () => {
      try { socket.end(); } catch {}
    });
  } catch {}
}

function json(socket: any, data: any, status = 200): void {
  respond(socket, status, 'application/json', JSON.stringify(data));
}

// ─── API Handlers ─────────────────────────────────────────────────────────────

async function apiDashboard(socket: any): Promise<void> {
  try {
    const db = await getDB();
    const today = new Date().toISOString().slice(0, 10);
    const todayOrders = await db.getAllAsync<any>(
      "SELECT * FROM orders WHERE status = 'selesai' AND created_at LIKE '" + today + "%'"
    );
    const totalRevenue = todayOrders.reduce((s: number, o: any) => s + (o.total || 0), 0);
    const lowStock = await db.getAllAsync<any>(
      'SELECT * FROM ingredients WHERE current_stock <= min_stock ORDER BY current_stock ASC'
    );
    const recentOrders = await db.getAllAsync<any>(
      'SELECT * FROM orders ORDER BY created_at DESC LIMIT 10'
    );
    json(socket, {
      success: true,
      data: {
        total_order_hari_ini: todayOrders.length,
        pendapatan_hari_ini: totalRevenue,
        stok_kritis: lowStock,
        order_terbaru: recentOrders,
      },
    });
  } catch (err: any) {
    json(socket, { success: false, error: err.message }, 500);
  }
}

async function apiGetMenus(socket: any): Promise<void> {
  try {
    const db = await getDB();
    const [menus, categories] = await Promise.all([
      db.getAllAsync<any>('SELECT * FROM menus WHERE is_active = 1 ORDER BY name'),
      db.getAllAsync<any>('SELECT * FROM categories ORDER BY name'),
    ]);
    json(socket, { success: true, data: { menus, categories } });
  } catch (err: any) {
    json(socket, { success: false, error: err.message }, 500);
  }
}

async function apiGetOrders(socket: any): Promise<void> {
  try {
    const db = await getDB();
    const orders = await db.getAllAsync<any>(
      'SELECT * FROM orders ORDER BY created_at DESC LIMIT 100'
    );
    json(socket, { success: true, data: orders });
  } catch (err: any) {
    json(socket, { success: false, error: err.message }, 500);
  }
}

async function apiCreateOrder(socket: any, body: string): Promise<void> {
  try {
    const data = JSON.parse(body);
    const db = await getDB();
    const orderId = generateId();
    const now = new Date().toISOString();
    const items: any[] = data.items || [];
    const subtotal = items.reduce((s: number, i: any) => s + (i.price * i.qty), 0);
    const tax = Math.round(subtotal * 0.11);
    const discount = data.discount || 0;
    const total = subtotal + tax - discount;

    await db.runAsync(
      'INSERT INTO orders (id, customer_id, table_no, status, payment_method, subtotal, tax, discount, total, note, synced, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
      orderId,
      data.customer_id || null,
      data.table_no || '-',
      'pending',
      data.payment_method || 'Tunai',
      subtotal,
      tax,
      discount,
      total,
      data.note || null,
      now
    );

    for (const item of items) {
      await db.runAsync(
        'INSERT INTO order_items (id, order_id, menu_id, qty, price, subtotal) VALUES (?, ?, ?, ?, ?, ?)',
        generateId(),
        orderId,
        item.menu_id,
        item.qty,
        item.price,
        item.price * item.qty
      );
    }

    notifyDataChange();
    json(socket, { success: true, data: { id: orderId, total } }, 201);
  } catch (err: any) {
    json(socket, { success: false, error: err.message }, 500);
  }
}

async function apiPatchOrderStatus(socket: any, orderId: string, body: string): Promise<void> {
  try {
    const { status } = JSON.parse(body);
    const db = await getDB();
    await db.runAsync('UPDATE orders SET status = ? WHERE id = ?', status, orderId);
    notifyDataChange();
    json(socket, { success: true });
  } catch (err: any) {
    json(socket, { success: false, error: err.message }, 500);
  }
}

async function apiGetIngredients(socket: any): Promise<void> {
  try {
    const db = await getDB();
    const ingredients = await db.getAllAsync<any>('SELECT * FROM ingredients ORDER BY name');
    json(socket, { success: true, data: ingredients });
  } catch (err: any) {
    json(socket, { success: false, error: err.message }, 500);
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

async function handleRequest(socket: any, req: HTTPRequest): Promise<void> {
  if (req.method === 'OPTIONS') {
    respond(socket, 204, 'text/plain', '');
    return;
  }

  // API routes
  if (req.pathname === '/api/dashboard') return apiDashboard(socket);
  if (req.pathname === '/api/menus') return apiGetMenus(socket);
  if (req.pathname === '/api/ingredients') return apiGetIngredients(socket);
  if (req.pathname === '/api/orders') {
    if (req.method === 'POST') return apiCreateOrder(socket, req.body);
    return apiGetOrders(socket);
  }
  // PATCH /api/orders/:id/status
  const patchMatch = req.pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
  if (patchMatch && req.method === 'PATCH') {
    return apiPatchOrderStatus(socket, patchMatch[1], req.body);
  }

  // Semua route lain → tampilkan Web UI
  respond(socket, 200, 'text/html', getWebUI());
}

// ─── Web UI ───────────────────────────────────────────────────────────────────
// HTML/CSS/JS single-page app yang di-serve ke browser perangkat lain.
// Tidak pakai template literal di dalam JS yang di-embed agar tidak konflik.

function getWebUI(): string {
  return '<!DOCTYPE html>' +
'<html lang="id">' +
'<head>' +
'<meta charset="UTF-8">' +
'<meta name="viewport" content="width=device-width,initial-scale=1">' +
'<title>UMKM Pro - Lokal</title>' +
'<style>' +
'*{margin:0;padding:0;box-sizing:border-box}' +
'body{font-family:system-ui,-apple-system,sans-serif;background:#f5f5f5;color:#1a1a1a;max-width:480px;margin:0 auto}' +
'header{background:#1D9E75;color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,.15)}' +
'header h1{font-size:17px;font-weight:700}' +
'nav{display:flex;gap:6px}' +
'nav button{background:rgba(255,255,255,.2);color:#fff;border:none;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600}' +
'nav button.active{background:#fff;color:#1D9E75}' +
'.page{display:none;padding:16px}' +
'.page.active{display:block}' +
'.stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}' +
'.stat{background:#fff;border-radius:12px;padding:14px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.07)}' +
'.stat .val{font-size:22px;font-weight:700;color:#1D9E75}' +
'.stat .lbl{font-size:11px;color:#777;margin-top:3px}' +
'.card{background:#fff;border-radius:12px;padding:14px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.07)}' +
'.card h2{font-size:14px;font-weight:700;margin-bottom:10px;color:#1a1a1a}' +
'.order-row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #f0f0f0}' +
'.order-row:last-child{border-bottom:none}' +
'.status-badge{padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600}' +
'.menu-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}' +
'.menu-card{background:#fff;border-radius:12px;padding:12px;cursor:pointer;border:2px solid transparent;box-shadow:0 1px 3px rgba(0,0,0,.07);transition:.15s}' +
'.menu-card.sel{border-color:#1D9E75;background:#E8F7F2}' +
'.menu-card .mn{font-size:13px;font-weight:600;margin-bottom:2px}' +
'.menu-card .mp{font-size:13px;color:#1D9E75;font-weight:700}' +
'.menu-card .mc{font-size:10px;color:#999;margin-bottom:4px}' +
'.menu-card .mq{font-size:11px;color:#1D9E75;margin-top:4px}' +
'.cart-section{background:#fff;border-radius:12px;padding:14px;margin-top:12px;box-shadow:0 1px 3px rgba(0,0,0,.07)}' +
'.ci{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f5f5f5}' +
'.ci:last-of-type{border-bottom:none}' +
'.qc{display:flex;align-items:center;gap:8px}' +
'.qb{width:26px;height:26px;border-radius:50%;border:1px solid #1D9E75;background:#fff;color:#1D9E75;font-size:15px;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center;font-weight:700}' +
'.total-line{display:flex;justify-content:space-between;padding:5px 0;font-size:13px}' +
'.total-line.big{font-size:15px;font-weight:700;padding:8px 0;border-top:1px solid #eee;margin-top:4px}' +
'input,select{width:100%;padding:9px 11px;border:1px solid #ddd;border-radius:8px;font-size:13px;margin-bottom:10px;outline:none;background:#fff}' +
'input:focus,select:focus{border-color:#1D9E75}' +
'.btn{padding:12px;border-radius:8px;border:none;cursor:pointer;font-size:14px;font-weight:700;width:100%;margin-top:4px}' +
'.btn-primary{background:#1D9E75;color:#fff}' +
'.btn-primary:disabled{background:#aaa;cursor:not-allowed}' +
'.stock-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f5f5f5}' +
'.stock-row:last-child{border-bottom:none}' +
'.pbar{height:5px;background:#eee;border-radius:3px;margin-top:4px;width:120px}' +
'.pfill{height:100%;border-radius:3px;background:#1D9E75}' +
'.pfill.warn{background:#BA7517}' +
'.pfill.danger{background:#E24B4A}' +
'.badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700}' +
'.b-ok{background:#E8F7F2;color:#1D9E75}' +
'.b-warn{background:#FEF3C7;color:#BA7517}' +
'.b-danger{background:#FEE2E2;color:#E24B4A}' +
'.cat-filter{display:flex;gap:7px;overflow-x:auto;padding-bottom:8px;margin-bottom:10px;-webkit-overflow-scrolling:touch}' +
'.cat-filter::-webkit-scrollbar{display:none}' +
'.cf-btn{padding:5px 13px;border-radius:20px;border:1px solid #ddd;background:#fff;font-size:12px;white-space:nowrap;cursor:pointer;color:#555;font-weight:500}' +
'.cf-btn.active{background:#1D9E75;color:#fff;border-color:#1D9E75}' +
'.spinner{text-align:center;padding:32px 16px;color:#999;font-size:14px}' +
'.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;opacity:0;transition:opacity .25s;pointer-events:none;z-index:999;max-width:90vw;text-align:center}' +
'.toast.show{opacity:1}' +
'</style>' +
'</head>' +
'<body>' +
'<header>' +
'  <h1>&#127978; UMKM Pro</h1>' +
'  <nav>' +
'    <button id="tab-db" class="active" onclick="goTab(\'db\')">Dashboard</button>' +
'    <button id="tab-or" onclick="goTab(\'or\')">Order</button>' +
'    <button id="tab-st" onclick="goTab(\'st\')">Stok</button>' +
'  </nav>' +
'</header>' +
'<div id="page-db" class="page active"><div class="spinner">Memuat...</div></div>' +
'<div id="page-or" class="page">' +
'  <div id="cat-bar" class="cat-filter"></div>' +
'  <div id="mnu-grid" class="menu-grid"></div>' +
'  <div id="cart-box" class="cart-section" style="display:none">' +
'    <h2>Keranjang Pesanan</h2>' +
'    <div id="cart-list"></div>' +
'    <div id="cart-totals" style="margin-top:8px"></div>' +
'    <input id="inp-table" type="text" placeholder="Nomor Meja (contoh: Meja 3)">' +
'    <select id="inp-pay">' +
'      <option value="Tunai">Tunai</option>' +
'      <option value="QRIS">QRIS</option>' +
'      <option value="Transfer">Transfer Bank</option>' +
'      <option value="Debit">Kartu Debit/Kredit</option>' +
'    </select>' +
'    <button class="btn btn-primary" id="btn-order" onclick="submitOrder()">Buat Order</button>' +
'  </div>' +
'</div>' +
'<div id="page-st" class="page"><div class="spinner">Memuat...</div></div>' +
'<div class="toast" id="toast-el"></div>' +
'<script>' +
'var menus=[],cats=[],cart=[],curCat="all";' +
'function fetchT(u,o){var c=new AbortController(),t=setTimeout(function(){c.abort();},10000);return fetch(u,Object.assign({signal:c.signal},o||{})).finally(function(){clearTimeout(t);});}' +
'function fmt(n){return "Rp "+Number(n||0).toLocaleString("id-ID");}' +
'function el(id){return document.getElementById(id);}' +
'function toast(msg,ms){' +
'  var t=el("toast-el");t.textContent=msg;t.classList.add("show");' +
'  setTimeout(function(){t.classList.remove("show");},ms||2500);' +
'}' +
'function goTab(t){' +
'  ["db","or","st"].forEach(function(k){' +
'    el("page-"+k).classList.remove("active");' +
'    el("tab-"+k).classList.remove("active");' +
'  });' +
'  el("page-"+t).classList.add("active");' +
'  el("tab-"+t).classList.add("active");' +
'  if(t==="db")loadDB();' +
'  if(t==="or"&&menus.length===0)loadMenus();' +
'  if(t==="st")loadStock();' +
'}' +
'function statusColor(s){' +
'  if(s==="selesai")return "background:#E8F7F2;color:#1D9E75";' +
'  if(s==="pending")return "background:#FEF3C7;color:#BA7517";' +
'  return "background:#FEE2E2;color:#E24B4A";' +
'}' +
'function loadDB(){' +
'  el("page-db").innerHTML="<div class=\\"spinner\\">Memuat...</div>";' +
'  fetchT("/api/dashboard").then(function(r){return r.json();}).then(function(res){' +
'    if(!res.success)throw new Error(res.error||"Gagal");' +
'    var d=res.data;' +
'    var kritisLen=(d.stok_kritis||[]).length;' +
'    var rows=(d.order_terbaru||[]).map(function(o){' +
'      return "<div class=\\"order-row\\">"' +
'        +"<div><div style=\\"font-weight:600;font-size:13px\\">"+( o.table_no||"-")+"</div>"' +
'        +"<div style=\\"font-size:11px;color:#888\\">"+(o.created_at||"").slice(11,16)+"</div></div>"' +
'        +"<div style=\\"text-align:right\\">"' +
'        +"<div style=\\"font-weight:700;font-size:13px;color:#1D9E75\\">"+fmt(o.total)+"</div>"' +
'        +"<span class=\\"status-badge\\" style=\\""+statusColor(o.status)+"\\">" +o.status+"</span></div>"' +
'        +"</div>";' +
'    }).join("");' +
'    var kritis=(d.stok_kritis||[]).length>0?' +
'      "<div class=\\"card\\" style=\\"border-left:3px solid #E24B4A\\"><h2 style=\\"color:#E24B4A\\">&#9888; Stok Kritis</h2>"' +
'      +(d.stok_kritis.map(function(s){' +
'        return "<div class=\\"stock-row\\">"' +
'          +"<span style=\\"font-size:13px\\">"+s.name+"</span>"' +
'          +"<span class=\\"badge b-danger\\">"+s.current_stock+" "+s.unit+"</span>"' +
'          +"</div>";' +
'      }).join(""))+"</div>":"";' +
'    el("page-db").innerHTML=' +
'      "<div class=\\"stat-grid\\">"' +
'      +"<div class=\\"stat\\"><div class=\\"val\\">"+d.total_order_hari_ini+"</div><div class=\\"lbl\\">Order Hari Ini</div></div>"' +
'      +"<div class=\\"stat\\"><div class=\\"val\\" style=\\"font-size:15px\\">"+fmt(d.pendapatan_hari_ini)+"</div><div class=\\"lbl\\">Pendapatan</div></div>"' +
'      +"<div class=\\"stat\\"><div class=\\"val\\" style=\\"color:"+(kritisLen>0?"#E24B4A":"#1D9E75")+"\\">"+kritisLen+"</div><div class=\\"lbl\\">Stok Kritis</div></div>"' +
'      +"<div class=\\"stat\\"><div class=\\"val\\">"+(d.order_terbaru||[]).length+"</div><div class=\\"lbl\\">Order Terbaru</div></div>"' +
'      +"</div>"' +
'      +kritis' +
'      +"<div class=\\"card\\"><h2>Order Terbaru</h2>"' +
'      +(rows||"<p style=\\"color:#999;font-size:13px\\">Belum ada order hari ini</p>")' +
'      +"</div>";' +
'  }).catch(function(){' +
'    el("page-db").innerHTML="<div class=\\"spinner\\" style=\\"color:#E24B4A;font-size:13px\\">&#10060; Gagal memuat. Pastikan HP & perangkat ini di jaringan yang sama.</div>"' +
'    +"<div style=\\"text-align:center;margin-top:12px\\"><button class=\\"btn btn-primary\\" style=\\"width:auto;padding:8px 20px\\" onclick=\\"loadDB()\\">Coba Lagi</button></div>";' +
'  });' +
'}' +
'function loadMenus(){' +
'  el("mnu-grid").innerHTML="<div class=\\"spinner\\">Memuat menu...</div>";' +
'  fetchT("/api/menus").then(function(r){return r.json();}).then(function(res){' +
'    if(!res.success)throw new Error(res.error);' +
'    menus=res.data.menus||[];' +
'    cats=res.data.categories||[];' +
'    renderCats();renderMenus();' +
'  }).catch(function(){' +
'    el("mnu-grid").innerHTML="<div class=\\"spinner\\" style=\\"color:#E24B4A\\">&#10060; Gagal memuat menu.</div>"' +
'    +"<div style=\\"text-align:center;margin-top:12px\\"><button class=\\"btn btn-primary\\" style=\\"width:auto;padding:8px 20px\\" onclick=\\"loadMenus()\\">Coba Lagi</button></div>";' +
'  });' +
'}' +
'function renderCats(){' +
'  var btns="<button class=\\"cf-btn "+(curCat==="all"?"active":"")+"\" onclick=\\"filterCat(\'all\')\\">Semua</button>";' +
'  cats.forEach(function(c){' +
'    btns+="<button class=\\"cf-btn "+(curCat===c.id?"active":"")+"\" onclick=\\"filterCat(\'"+c.id+"\')\\">"+c.name+"</button>";' +
'  });' +
'  el("cat-bar").innerHTML=btns;' +
'}' +
'function filterCat(id){curCat=id;renderCats();renderMenus();}' +
'function renderMenus(){' +
'  var list=curCat==="all"?menus:menus.filter(function(m){return m.category_id===curCat;});' +
'  el("mnu-grid").innerHTML=list.map(function(m){' +
'    var inCart=cart.find(function(i){return i.menu_id===m.id;});' +
'    var catName=(cats.find(function(c){return c.id===m.category_id;})||{}).name||"";' +
'    return "<div class=\\"menu-card "+(inCart?"sel":"")+"\" onclick=\\"addToCart(\'"+m.id+"\')\\">"' +
'      +"<div class=\\"mc\\">"+catName+"</div>"' +
'      +"<div class=\\"mn\\">"+m.name+"</div>"' +
'      +"<div class=\\"mp\\">"+fmt(m.sell_price)+"</div>"' +
'      +(inCart?"<div class=\\"mq\\">&#10003; "+inCart.qty+"x di keranjang</div>":"")' +
'      +"</div>";' +
'  }).join("");' +
'}' +
'function addToCart(id){' +
'  var m=menus.find(function(x){return x.id===id;});' +
'  if(!m)return;' +
'  var ex=cart.find(function(i){return i.menu_id===id;});' +
'  if(ex){ex.qty++;}else{cart.push({menu_id:id,name:m.name,price:m.sell_price,qty:1});}' +
'  renderCart();renderMenus();' +
'}' +
'function updateQty(id,d){' +
'  var idx=cart.findIndex(function(i){return i.menu_id===id;});' +
'  if(idx<0)return;' +
'  cart[idx].qty+=d;' +
'  if(cart[idx].qty<=0)cart.splice(idx,1);' +
'  renderCart();renderMenus();' +
'}' +
'function renderCart(){' +
'  var cb=el("cart-box");' +
'  if(cart.length===0){cb.style.display="none";return;}' +
'  cb.style.display="block";' +
'  var sub=cart.reduce(function(s,i){return s+i.price*i.qty;},0);' +
'  var tax=Math.round(sub*0.11);' +
'  var tot=sub+tax;' +
'  el("cart-list").innerHTML=cart.map(function(i){' +
'    return "<div class=\\"ci\\">"' +
'      +"<div><div style=\\"font-size:13px;font-weight:600\\">"+i.name+"</div>"' +
'      +"<div style=\\"font-size:11px;color:#888\\">"+fmt(i.price)+" x "+i.qty+" = "+fmt(i.price*i.qty)+"</div></div>"' +
'      +"<div class=\\"qc\\">"' +
'      +"<button class=\\"qb\\" onclick=\\"updateQty(\'"+i.menu_id+"\',-1)\\">-</button>"' +
'      +"<span style=\\"font-weight:700;min-width:18px;text-align:center\\">"+i.qty+"</span>"' +
'      +"<button class=\\"qb\\" onclick=\\"updateQty(\'"+i.menu_id+"\',1)\\">+</button>"' +
'      +"</div></div>";' +
'  }).join("");' +
'  el("cart-totals").innerHTML=' +
'    "<div class=\\"total-line\\"><span>Subtotal</span><span>"+fmt(sub)+"</span></div>"' +
'    +"<div class=\\"total-line\\"><span>PPN 11%</span><span>"+fmt(tax)+"</span></div>"' +
'    +"<div class=\\"total-line big\\"><span>Total</span><span style=\\"color:#1D9E75\\">"+fmt(tot)+"</span></div>";' +
'}' +
'function submitOrder(){' +
'  if(cart.length===0){toast("Keranjang masih kosong");return;}' +
'  var btn=el("btn-order");' +
'  btn.disabled=true;btn.textContent="Memproses...";' +
'  fetchT("/api/orders",{' +
'    method:"POST",' +
'    headers:{"Content-Type":"application/json"},' +
'    body:JSON.stringify({' +
'      table_no:el("inp-table").value||"-",' +
'      payment_method:el("inp-pay").value,' +
'      items:cart' +
'    })' +
'  }).then(function(r){return r.json();}).then(function(res){' +
'    if(res.success){' +
'      toast("&#10003; Order berhasil dibuat!");' +
'      cart=[];renderCart();renderMenus();' +
'      el("inp-table").value="";' +
'    }else{toast("&#10060; Gagal: "+(res.error||""));}' +
'  }).catch(function(){toast("&#10060; Tidak bisa terhubung ke server");})' +
'  .finally(function(){btn.disabled=false;btn.textContent="Buat Order";});' +
'}' +
'function loadStock(){' +
'  el("page-st").innerHTML="<div class=\\"spinner\\">Memuat stok...</div>";' +
'  fetchT("/api/ingredients").then(function(r){return r.json();}).then(function(res){' +
'    if(!res.success)throw new Error(res.error);' +
'    var items=res.data||[];' +
'    var rows=items.map(function(i){' +
'      var maxVal=i.min_stock>0?i.min_stock*2:10;' +
'      var pct=Math.min(100,Math.round((i.current_stock/maxVal)*100));' +
'      var st=i.current_stock<=0?"Habis":i.current_stock<=i.min_stock?"Kritis":i.current_stock<=i.min_stock*1.5?"Rendah":"Aman";' +
'      var bc=st==="Aman"?"":"st==="+"Rendah"?"warn":"danger";' +
'      var bclass=st==="Aman"?"b-ok":st==="Rendah"?"b-warn":"b-danger";' +
'      var barClass=st==="Aman"?"":st==="Rendah"?"warn":"danger";' +
'      return "<div class=\\"stock-row\\">"' +
'        +"<div><div style=\\"font-size:13px;font-weight:600\\">"+i.name+"</div>"' +
'        +"<div class=\\"pbar\\"><div class=\\"pfill "+barClass+"\\" style=\\"width:"+pct+"%\\"></div></div>"' +
'        +"<div style=\\"font-size:11px;color:#888;margin-top:2px\\">"+i.current_stock+" "+i.unit+" (min: "+i.min_stock+")</div></div>"' +
'        +"<span class=\\"badge "+bclass+"\\">"+st+"</span>"' +
'        +"</div>";' +
'    }).join("");' +
'    el("page-st").innerHTML=' +
'      "<div class=\\"card\\"><h2>Status Stok Bahan Baku</h2>"+rows+"</div>";' +
'  }).catch(function(){' +
'    el("page-st").innerHTML="<div class=\\"spinner\\" style=\\"color:#E24B4A\\">&#10060; Gagal memuat stok.</div>"' +
'    +"<div style=\\"text-align:center;margin-top:12px\\"><button class=\\"btn btn-primary\\" style=\\"width:auto;padding:8px 20px\\" onclick=\\"loadStock()\\">Coba Lagi</button></div>";' +
'  });' +
'}' +
'loadDB();' +
'<\/script>' +
'</body></html>';
}

// ─── Server lifecycle ─────────────────────────────────────────────────────────

export async function startHTTPServer(port = 3000): Promise<{ port: number } | null> {
  if (Platform.OS === 'web') return null;

  let TcpSocket: any;
  try {
    TcpSocket = require('react-native-tcp-socket');
  } catch {
    console.warn('[httpServer] react-native-tcp-socket tidak tersedia');
    return null;
  }

  if (_server) await stopHTTPServer();

  _port = port;

  // Pre-warm DB agar request pertama tidak hang saat initSchema berjalan
  try { await getDB(); } catch {}

  return new Promise((resolve, reject) => {
    _server = TcpSocket.createServer((socket: any) => {
      let buffer = '';

      socket.on('data', (chunk: any) => {
        try {
          buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf-8');

          // Tunggu sampai header HTTP lengkap (ditandai \r\n\r\n)
          if (!buffer.includes('\r\n\r\n')) return;

          // Periksa Content-Length untuk memastikan body sudah lengkap
          const headerEnd = buffer.indexOf('\r\n\r\n');
          const headerSection = buffer.substring(0, headerEnd);
          const clMatch = headerSection.match(/content-length:\s*(\d+)/i);
          const expectedBody = clMatch ? parseInt(clMatch[1], 10) : 0;
          const currentBody = buffer.length - headerEnd - 4;
          if (currentBody < expectedBody) return; // Tunggu sisa body

          const req = parseRequest(buffer);
          buffer = '';

          if (!req) {
            respond(socket, 400, 'text/plain', 'Bad Request');
            return;
          }

          handleRequest(socket, req).catch(() => {
            try { socket.destroy(); } catch {}
          });
        } catch {
          try { socket.destroy(); } catch {}
        }
      });

      socket.on('error', () => {
        try { socket.destroy(); } catch {}
      });

      socket.on('close', () => {});
    });

    _server.on('error', (err: any) => {
      console.error('[httpServer] Error:', err.message);
      _server = null;
      reject(err);
    });

    _server.listen({ port, host: '0.0.0.0', reuseAddress: true }, () => {
      console.log('[httpServer] Berjalan di port', port);
      resolve({ port });
    });
  });
}

export async function stopHTTPServer(): Promise<void> {
  if (_server) {
    try { _server.close(); } catch {}
    _server = null;
  }
}

export function getServerPort(): number { return _port; }
