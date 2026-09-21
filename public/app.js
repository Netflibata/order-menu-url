(function () {
  "use strict";

  var statusNames = { pending: "待接单", preparing: "制作中", completed: "已完成", refunded: "已退款" };
  var state = { categories: [], dishes: [], active: "all", search: "", cart: {}, adminTab: "orders", adminData: { categories: [], dishes: [], orders: [] } };

  function el(id) { return document.getElementById(id); }
  function esc(value) { var div = document.createElement("div"); div.textContent = String(value == null ? "" : value); return div.innerHTML; }
  function money(cents) { var amount = Number(cents || 0) / 100; return "¥" + amount.toFixed(amount % 1 ? 2 : 0); }
  function dateText(value) { try { return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); } catch (_) { return value || ""; } }
  function toast(message) { var node = el("toast"); node.textContent = message; node.classList.add("show"); clearTimeout(node.timer); node.timer = setTimeout(function () { node.classList.remove("show"); }, 2200); }
  function openModal(id) { el(id).classList.remove("hidden"); }
  function closeModal(id) { el(id).classList.add("hidden"); }
  function setError(id, message) { var node = el(id); node.textContent = message || ""; node.classList.toggle("hidden", !message); }
  function loading() { return '<div class="loading"><div class="spinner"></div><div>正在加载…</div></div>'; }
  function currentUser() { return (localStorage.getItem("yunxiang_customer_name") || "").trim(); }
  function orderStorageKey() { return "yunxiang_order_nos:" + encodeURIComponent(currentUser().toLowerCase()); }
  function updateUserUI() { var name = currentUser(); el("userBtn").textContent = name ? "你好，" + name : "用户登录"; el("customerName").value = name; }
  function showUserLogin() { el("userName").value = currentUser(); setError("userLoginError", ""); openModal("userLoginModal"); setTimeout(function () { el("userName").focus(); }, 50); }

  async function api(path, options) {
    var response = await fetch(path, Object.assign({ headers: { "content-type": "application/json" } }, options || {}));
    var data;
    try { data = await response.json(); } catch (_) { data = {}; }
    if (!response.ok) { var error = new Error(data.error || "操作没有完成，请稍后重试"); error.status = response.status; throw error; }
    return data;
  }

  async function uploadImage(file) {
    var form = new FormData(); form.append("file", file);
    var response = await fetch("/api/admin/uploads", { method: "POST", body: form });
    var data;
    try { data = await response.json(); } catch (_) { data = {}; }
    if (!response.ok) throw new Error(data.error || "图片上传失败，请稍后重试");
    return data.url;
  }

  function categoryById(id) { return state.categories.find(function (category) { return category.id === id; }); }

  function renderCategories() {
    var items = [{ id: "all", name: "全部" }].concat(state.categories.filter(function (item) { return item.active !== false; }));
    el("categoryList").innerHTML = items.map(function (item) {
      return '<button class="category-btn ' + (state.active === item.id ? "active" : "") + '" data-category="' + esc(item.id) + '">' + esc(item.name) + '</button>';
    }).join("");
  }

  function renderDishes() {
    var query = state.search.toLowerCase();
    var dishes = state.dishes.filter(function (dish) {
      return dish.available !== false && (state.active === "all" || dish.categoryId === state.active) && (!query || dish.name.toLowerCase().indexOf(query) >= 0 || (dish.description || "").toLowerCase().indexOf(query) >= 0);
    });
    var activeCategory = categoryById(state.active);
    el("categoryTitle").textContent = activeCategory ? activeCategory.name : "本店招牌";
    if (!dishes.length) { el("dishGrid").innerHTML = '<div class="empty-state"><strong>没有找到相关菜品</strong><p>换个分类或关键词试试。</p></div>'; return; }
    el("dishGrid").innerHTML = dishes.map(function (dish, index) {
      var category = categoryById(dish.categoryId);
      var image = dish.imageUrl || "/assets/kung-pao-chicken.png";
      var priority = index < 2;
      return '<article class="dish-card"><div class="dish-photo"><img src="' + esc(image) + '" alt="' + esc(dish.name) + '" loading="' + (priority ? "eager" : "lazy") + '" decoding="async"' + (priority ? ' fetchpriority="high"' : "") + '><span class="badge">' + esc(category ? category.name : (index === 0 ? "推荐" : "现点现做")) + '</span></div><div class="dish-body"><div class="dish-row"><div class="dish-name">' + esc(dish.name) + '</div><div class="price"><small>¥</small>' + (dish.priceCents / 100).toFixed(dish.priceCents % 100 ? 2 : 0) + '</div></div><p class="dish-desc">' + esc(dish.description || "今日新鲜制作") + '</p><button class="add-btn" data-add="' + esc(dish.id) + '">＋ 加入点菜单</button></div></article>';
    }).join("");
    Array.from(el("dishGrid").querySelectorAll("img")).forEach(function (image) { image.addEventListener("error", function () { image.src = "/assets/image-unavailable.svg"; }, { once: true }); });
  }

  function cartSummary() {
    var rows = Object.keys(state.cart).map(function (id) {
      var dish = state.dishes.find(function (item) { return item.id === id; });
      return dish ? { dish: dish, qty: state.cart[id] } : null;
    }).filter(Boolean);
    return { rows: rows, count: rows.reduce(function (sum, row) { return sum + row.qty; }, 0), total: rows.reduce(function (sum, row) { return sum + row.qty * row.dish.priceCents; }, 0) };
  }

  function renderCheckoutSummary() {
    var summary = cartSummary();
    el("checkoutCount").textContent = summary.count + " 份";
    el("checkoutTotal").textContent = money(summary.total);
    el("checkoutItems").innerHTML = summary.rows.map(function (row) {
      return '<div class="checkout-summary-item"><span>' + esc(row.dish.name) + ' <em>× ' + row.qty + '</em></span><strong>' + money(row.qty * row.dish.priceCents) + '</strong></div>';
    }).join("");
  }

  function renderCart() {
    var summary = cartSummary();
    el("cartCount").textContent = summary.count + " 份";
    el("cartTotal").textContent = money(summary.total);
    el("mobileCount").textContent = summary.count;
    el("mobileTotal").textContent = money(summary.total) + " · 去结算";
    el("checkoutBtn").disabled = !summary.count;
    el("mobileCart").style.display = innerWidth <= 1240 ? "flex" : "none";
    el("cartBody").innerHTML = summary.rows.length ? summary.rows.map(function (row) {
      return '<div class="cart-item"><div><strong>' + esc(row.dish.name) + '</strong><div class="qty"><button data-qty="' + esc(row.dish.id) + '" data-delta="-1" aria-label="减少">−</button><span>' + row.qty + ' 份</span><button data-qty="' + esc(row.dish.id) + '" data-delta="1" aria-label="增加">＋</button></div></div><div class="cart-item-price">' + money(row.qty * row.dish.priceCents) + '</div></div>';
    }).join("") : '<div class="empty-cart"><div class="empty-cart-mark">箸</div><div>还没有选菜</div><small>喜欢的菜，点一下就加入</small></div>';
  }

  async function loadMenu() {
    try {
      var data = await api("/api/menu");
      state.categories = data.categories || [];
      state.dishes = data.dishes || [];
      Object.keys(state.cart).forEach(function (id) { if (!state.dishes.some(function (dish) { return dish.id === id && dish.available !== false; })) delete state.cart[id]; });
      renderCategories(); renderDishes(); renderCart();
    } catch (error) {
      el("dishGrid").innerHTML = '<div class="empty-state"><strong>菜单暂时没有加载成功</strong><p>' + esc(error.message) + '</p><button class="ghost-btn" onclick="location.reload()">重新加载</button></div>';
    }
  }

  function recentOrderNos() { if (!currentUser()) return []; try { return JSON.parse(localStorage.getItem(orderStorageKey()) || "[]"); } catch (_) { return []; } }
  function rememberOrder(orderNo) { var list = [orderNo].concat(recentOrderNos().filter(function (item) { return item !== orderNo; })).slice(0, 12); localStorage.setItem(orderStorageKey(), JSON.stringify(list)); }

  async function placeOrder(details) {
    var summary = cartSummary();
    var name = currentUser();
    if (!name) throw new Error("请先填写称呼登录");
    if (!summary.count) throw new Error("请先选择菜品");
    var payload = Object.assign({}, details, { customerName: name, items: summary.rows.map(function (row) { return { id: row.dish.id, quantity: row.qty }; }) });
    var result = await api("/api/orders", { method: "POST", body: JSON.stringify(payload) });
    rememberOrder(result.order.orderNo);
    state.cart = {};
    renderCart();
    return result.order;
  }

  async function showOrders() {
    if (!currentUser()) { showUserLogin(); return; }
    openModal("ordersModal"); el("orderList").innerHTML = loading();
    var orderNos = recentOrderNos();
    if (!orderNos.length) { el("orderList").innerHTML = '<div class="empty-state"><strong>还没有订单</strong><p>下单后可以在这里查看进度和申请退款。</p></div>'; return; }
    var results = await Promise.all(orderNos.map(function (orderNo) { return api("/api/orders/" + encodeURIComponent(orderNo)).then(function (data) { return data.order; }).catch(function () { return null; }); }));
    var orders = results.filter(Boolean);
    if (!orders.length) { el("orderList").innerHTML = '<div class="empty-state"><strong>没有找到订单</strong><p>订单记录可能已过期。</p></div>'; return; }
    el("orderList").innerHTML = orders.map(function (order) {
      var items = order.items.map(function (item) { return esc(item.dishName) + " × " + item.quantity; }).join(" · ");
      var refund = order.status === "pending" ? '<button class="danger-btn" data-refund="' + esc(order.orderNo) + '">申请退款</button>' : "";
      return '<article class="order-card"><div class="order-card-head"><div><div class="order-no">' + esc(order.orderNo) + '</div><div class="order-time">' + dateText(order.createdAt) + (order.tableNo ? " · " + esc(order.tableNo) : "") + '</div></div><span class="status-chip ' + esc(order.status) + '">' + esc(statusNames[order.status] || order.status) + '</span></div><div class="order-items">' + items + '</div><div class="order-card-foot"><strong>' + money(order.totalCents) + '</strong>' + refund + '</div></article>';
    }).join("");
  }

  async function openAdmin() {
    try {
      var status = await api("/api/admin/status");
      if (status.authenticated) await showAdmin(); else openModal("adminLoginModal");
    } catch (_) { openModal("adminLoginModal"); }
  }

  async function loadAdminData() {
    var values = await Promise.all([api("/api/admin/menu"), api("/api/admin/orders")]);
    state.adminData.categories = values[0].categories || [];
    state.adminData.dishes = values[0].dishes || [];
    state.adminData.orders = values[1].orders || [];
  }

  async function showAdmin() {
    closeModal("adminLoginModal"); openModal("adminModal"); el("adminContent").innerHTML = loading();
    try { await loadAdminData(); renderAdmin(); } catch (error) { if (error.status === 401) { closeModal("adminModal"); openModal("adminLoginModal"); } else el("adminContent").innerHTML = '<div class="error-box">' + esc(error.message) + '</div>'; }
  }

  function renderAdmin() {
    Array.from(document.querySelectorAll("[data-admin-tab]")).forEach(function (button) { button.classList.toggle("active", button.dataset.adminTab === state.adminTab); });
    if (state.adminTab === "orders") renderAdminOrders();
    if (state.adminTab === "dishes") renderAdminDishes();
    if (state.adminTab === "categories") renderAdminCategories();
  }

  function renderAdminOrders() {
    var orders = state.adminData.orders;
    var body = orders.length ? orders.map(function (order) {
      var items = order.items.map(function (item) { return esc(item.dishName) + " ×" + item.quantity; }).join("、");
      var options = Object.keys(statusNames).map(function (status) { return '<option value="' + status + '" ' + (order.status === status ? "selected" : "") + '>' + statusNames[status] + '</option>'; }).join("");
      return '<tr><td data-label="订单"><strong>' + esc(order.orderNo) + '</strong><div class="order-time">' + dateText(order.createdAt) + '</div></td><td data-label="顾客">' + esc(order.customerName) + '<div class="order-time">' + esc(order.tableNo || "未填桌号") + '</div></td><td data-label="菜品" title="' + esc(items) + '">' + esc(items.slice(0, 40)) + (items.length > 40 ? "…" : "") + '</td><td data-label="金额"><strong>' + money(order.totalCents) + '</strong></td><td data-label="状态"><select class="inline-select" data-order-select="' + esc(order.id) + '">' + options + '</select></td><td data-label="操作"><div class="tiny-actions"><button class="tiny-btn" data-save-order="' + esc(order.id) + '">保存</button><button class="tiny-btn danger" data-delete-order="' + esc(order.id) + '">删除</button></div></td></tr>';
    }).join("") : '<tr><td colspan="6"><div class="empty-state">暂时没有订单</div></td></tr>';
    el("adminContent").innerHTML = '<div class="admin-toolbar"><div><h3>订单管理</h3><div class="admin-note">删除后会从所有设备的订单记录中移除</div></div><button class="ghost-btn" data-refresh-admin>刷新</button></div><section class="bulk-delete-panel" aria-labelledby="bulkDeleteTitle"><div><h4 id="bulkDeleteTitle">按日期删除订单</h4><p>选择日期并输入二次确认密码后，永久删除当天所有订单；此操作无法恢复。</p></div><form id="bulkDeleteOrdersForm" class="bulk-delete-form"><label>订单日期<input name="date" type="date" required></label><label>二次确认密码<input name="password" type="password" required autocomplete="off" placeholder="请输入删除密码"></label><button class="danger-solid" type="submit">删除当天全部订单</button><div class="error-box hidden" id="bulkDeleteError"></div></form></section><table class="admin-table order-admin-table"><thead><tr><th>订单号</th><th>顾客</th><th>菜品</th><th>金额</th><th>状态</th><th>操作</th></tr></thead><tbody>' + body + '</tbody></table>';
    el("bulkDeleteOrdersForm").addEventListener("submit", deleteOrdersByDate);
  }

  async function deleteOrdersByDate(event) {
    event.preventDefault();
    var form = event.currentTarget; var date = form.elements.date.value; var password = form.elements.password.value; var button = form.querySelector('[type="submit"]');
    if (!date || !password) { setError("bulkDeleteError", "请选择日期并输入二次确认密码"); return; }
    if (!confirm("确认永久删除 " + date + " 的全部订单？删除后所有设备都无法查看或恢复。")) return;
    button.disabled = true; button.textContent = "正在删除…"; setError("bulkDeleteError", "");
    try {
      var result = await api("/api/admin/orders/delete-by-date", { method: "POST", body: JSON.stringify({ date: date, password: password }) });
      form.elements.password.value = ""; await loadAdminData(); renderAdmin();
      toast(result.deletedCount ? "已删除 " + result.deletedCount + " 个订单" : "所选日期没有订单");
    } catch (error) { setError("bulkDeleteError", error.message); }
    finally { button.disabled = false; button.textContent = "删除当天全部订单"; }
  }

  function renderAdminDishes() {
    var categories = state.adminData.categories;
    var rows = state.adminData.dishes.map(function (dish) {
      var category = categories.find(function (item) { return item.id === dish.categoryId; });
      return '<tr><td><img class="thumb" src="' + esc(dish.imageUrl || "/assets/kung-pao-chicken.png") + '" alt=""></td><td><strong>' + esc(dish.name) + '</strong><div class="order-time">' + esc(dish.description) + '</div></td><td>' + esc(category ? category.name : "未分类") + '</td><td>' + money(dish.priceCents) + '</td><td><span class="status-chip ' + (dish.available ? "completed" : "refunded") + '">' + (dish.available ? "已上架" : "已下架") + '</span></td><td><div class="tiny-actions"><button class="tiny-btn" data-edit-dish="' + esc(dish.id) + '">编辑</button><button class="tiny-btn danger" data-delete-dish="' + esc(dish.id) + '">删除</button></div></td></tr>';
    }).join("");
    el("adminContent").innerHTML = '<div class="admin-toolbar"><div><h3>菜品管理</h3><div class="admin-note">新增、改价、换图和删除都在这里完成</div></div><button class="primary-btn" data-new-dish>＋ 新增菜品</button></div><table class="admin-table"><thead><tr><th>图片</th><th>菜品</th><th>分类</th><th>价格</th><th>状态</th><th></th></tr></thead><tbody>' + (rows || '<tr><td colspan="6"><div class="empty-state">暂无菜品</div></td></tr>') + '</tbody></table>';
  }

  function renderAdminCategories() {
    var rows = state.adminData.categories.map(function (category) {
      return '<div class="category-admin-row" data-category-row="' + esc(category.id) + '"><input name="name" value="' + esc(category.name) + '" aria-label="分类名称"><input name="sortOrder" type="number" value="' + Number(category.sortOrder || 0) + '" aria-label="排序"><label class="inline-check"><input name="active" type="checkbox" ' + (category.active ? "checked" : "") + '> 启用</label><div class="tiny-actions"><button class="tiny-btn" data-save-category="' + esc(category.id) + '">保存</button><button class="tiny-btn danger" data-delete-category="' + esc(category.id) + '">删除</button></div></div>';
    }).join("");
    el("adminContent").innerHTML = '<div class="admin-toolbar"><div><h3>分类管理</h3><div class="admin-note">排序数字越小越靠前</div></div></div><form id="newCategoryForm" class="form-row" style="margin-bottom:16px"><div class="field"><label>新分类名称</label><input name="name" required maxlength="30" placeholder="例如：今日特价"></div><div class="field"><label>&nbsp;</label><button class="primary-btn" type="submit">新增分类</button></div></form><div class="category-admin-list">' + rows + '</div>';
    el("newCategoryForm").addEventListener("submit", createCategory);
  }

  function openDishEditor(id) {
    var dish = state.adminData.dishes.find(function (item) { return item.id === id; });
    var form = el("dishForm"); form.reset(); setError("dishFormError", "");
    form.elements.id.value = dish ? dish.id : "";
    form.elements.name.value = dish ? dish.name : "";
    form.elements.price.value = dish ? (dish.priceCents / 100).toFixed(2) : "";
    form.elements.sortOrder.value = dish ? dish.sortOrder : 100;
    form.elements.imageUrl.value = dish ? dish.imageUrl : "";
    form.elements.description.value = dish ? dish.description : "";
    form.elements.available.checked = dish ? dish.available : true;
    form.elements.categoryId.innerHTML = state.adminData.categories.map(function (category) { return '<option value="' + esc(category.id) + '">' + esc(category.name) + '</option>'; }).join("");
    if (dish) form.elements.categoryId.value = dish.categoryId;
    el("dishEditorTitle").textContent = dish ? "编辑菜品" : "新增菜品";
    openModal("dishEditorModal");
  }

  async function createCategory(event) {
    event.preventDefault(); var form = event.currentTarget; var button = form.querySelector("button"); button.disabled = true;
    try { await api("/api/admin/categories", { method: "POST", body: JSON.stringify({ name: form.elements.name.value }) }); form.reset(); await loadAdminData(); renderAdmin(); await loadMenu(); toast("分类已新增"); }
    catch (error) { toast(error.message); } finally { button.disabled = false; }
  }

  async function registerWebMCP() {
    var context = document.modelContext;
    if (!context || !context.registerTool) return;
    var lifecycle = new AbortController();
    await Promise.resolve(context.registerTool({
      name: "list_menu", title: "查看菜单", description: "查看当前可点的分类、菜品和价格。", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: function () { return { categories: state.categories, dishes: state.dishes.filter(function (dish) { return dish.available !== false; }).map(function (dish) { return { id: dish.id, name: dish.name, priceCents: dish.priceCents, categoryId: dish.categoryId }; }) }; }
    }, { signal: lifecycle.signal }));
    await Promise.resolve(context.registerTool({
      name: "add_dishes_to_cart", title: "加入点菜单", description: "按菜品 ID 和数量把一组菜品加入当前点菜单。", inputSchema: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, quantity: { type: "integer", minimum: 1, maximum: 99 } }, required: ["id", "quantity"], additionalProperties: false } } }, required: ["items"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: function (input) { input.items.forEach(function (item) { if (!state.dishes.some(function (dish) { return dish.id === item.id && dish.available !== false; })) throw new Error("菜品不存在或已下架: " + item.id); state.cart[item.id] = (state.cart[item.id] || 0) + item.quantity; }); renderCart(); return cartSummary(); }
    }, { signal: lifecycle.signal }));
    await Promise.resolve(context.registerTool({
      name: "create_order", title: "提交订单", description: "用当前点菜单提交订单；会真实创建订单。", inputSchema: { type: "object", properties: { customerName: { type: "string" }, tableNo: { type: "string" }, phone: { type: "string" }, note: { type: "string" } }, required: ["customerName"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async function (input) { var order = await placeOrder(input); return { orderNo: order.orderNo, status: order.status, totalCents: order.totalCents }; }
    }, { signal: lifecycle.signal }));
  }

  document.addEventListener("click", async function (event) {
    var category = event.target.closest("[data-category]"); if (category) { state.active = category.dataset.category; renderCategories(); renderDishes(); }
    var add = event.target.closest("[data-add]"); if (add) { state.cart[add.dataset.add] = (state.cart[add.dataset.add] || 0) + 1; renderCart(); toast("已加入点菜单"); }
    var quantity = event.target.closest("[data-qty]"); if (quantity) { var id = quantity.dataset.qty; state.cart[id] = (state.cart[id] || 0) + Number(quantity.dataset.delta); if (state.cart[id] <= 0) delete state.cart[id]; renderCart(); }
    var close = event.target.closest("[data-close]"); if (close) closeModal(close.dataset.close);
    var refund = event.target.closest("[data-refund]"); if (refund && confirm("确认申请退款？未开始制作的订单会直接标记为已退款。")) { try { await api("/api/orders/" + encodeURIComponent(refund.dataset.refund) + "/refund", { method: "POST", body: "{}" }); toast("订单已退款"); await showOrders(); } catch (error) { toast(error.message); } }
    var adminTab = event.target.closest("[data-admin-tab]"); if (adminTab) { state.adminTab = adminTab.dataset.adminTab; renderAdmin(); }
    if (event.target.closest("[data-refresh-admin]")) { el("adminContent").innerHTML = loading(); try { await loadAdminData(); renderAdmin(); } catch (error) { toast(error.message); } }
    var saveOrder = event.target.closest("[data-save-order]"); if (saveOrder) { var select = document.querySelector('[data-order-select="' + CSS.escape(saveOrder.dataset.saveOrder) + '"]'); try { await api("/api/admin/orders/" + encodeURIComponent(saveOrder.dataset.saveOrder), { method: "PATCH", body: JSON.stringify({ status: select.value }) }); await loadAdminData(); renderAdmin(); toast("订单状态已更新"); } catch (error) { toast(error.message); } }
    var deleteOrder = event.target.closest("[data-delete-order]"); if (deleteOrder && confirm("确认永久删除这个订单？删除后所有设备都无法再查看或恢复。")) { try { await api("/api/admin/orders/" + encodeURIComponent(deleteOrder.dataset.deleteOrder), { method: "DELETE" }); await loadAdminData(); renderAdmin(); toast("订单已从所有设备中删除"); } catch (error) { toast(error.message); } }
    if (event.target.closest("[data-new-dish]")) openDishEditor();
    var editDish = event.target.closest("[data-edit-dish]"); if (editDish) openDishEditor(editDish.dataset.editDish);
    var deleteDish = event.target.closest("[data-delete-dish]"); if (deleteDish && confirm("确认删除这个菜品？历史订单中的菜名和价格仍会保留。")) { try { await api("/api/admin/dishes/" + encodeURIComponent(deleteDish.dataset.deleteDish), { method: "DELETE" }); await loadAdminData(); renderAdmin(); await loadMenu(); toast("菜品已删除"); } catch (error) { toast(error.message); } }
    var saveCategory = event.target.closest("[data-save-category]"); if (saveCategory) { var row = saveCategory.closest("[data-category-row]"); try { await api("/api/admin/categories/" + encodeURIComponent(saveCategory.dataset.saveCategory), { method: "PATCH", body: JSON.stringify({ name: row.querySelector('[name="name"]').value, sortOrder: Number(row.querySelector('[name="sortOrder"]').value), active: row.querySelector('[name="active"]').checked }) }); await loadAdminData(); renderAdmin(); await loadMenu(); toast("分类已保存"); } catch (error) { toast(error.message); } }
    var deleteCategory = event.target.closest("[data-delete-category]"); if (deleteCategory && confirm("确认删除这个分类？分类下有菜品时不能删除。")) { try { await api("/api/admin/categories/" + encodeURIComponent(deleteCategory.dataset.deleteCategory), { method: "DELETE" }); await loadAdminData(); renderAdmin(); await loadMenu(); toast("分类已删除"); } catch (error) { toast(error.message); } }
  });

  el("searchInput").addEventListener("input", function (event) { state.search = event.target.value.trim(); renderDishes(); });
  function showCheckout() { if (!currentUser()) { showUserLogin(); return; } updateUserUI(); if (!cartSummary().count) { toast("请先选择菜品"); return; } renderCheckoutSummary(); openModal("checkoutModal"); }
  el("checkoutBtn").addEventListener("click", showCheckout); el("mobileCart").addEventListener("click", showCheckout);
  el("userBtn").addEventListener("click", showUserLogin); el("ordersBtn").addEventListener("click", showOrders); el("adminBtn").addEventListener("click", openAdmin);
  el("userLoginAdminBtn").addEventListener("click", openAdmin);
  el("userLoginForm").addEventListener("submit", function (event) {
    event.preventDefault(); var name = event.currentTarget.elements.name.value.trim();
    if (!name) { setError("userLoginError", "请输入一个称呼"); return; }
    localStorage.setItem("yunxiang_customer_name", name.slice(0, 30)); updateUserUI(); closeModal("userLoginModal"); toast("欢迎，" + currentUser());
  });
  el("checkoutForm").addEventListener("submit", async function (event) {
    event.preventDefault(); var form = event.currentTarget; var button = form.querySelector('[type="submit"]'); button.disabled = true; button.textContent = "正在下单…";
    try { var order = await placeOrder({ tableNo: form.elements.tableNo.value, phone: form.elements.phone.value, note: form.elements.note.value }); form.reset(); updateUserUI(); closeModal("checkoutModal"); toast("下单成功：" + order.orderNo); await showOrders(); }
    catch (error) { toast(error.message); } finally { button.disabled = false; button.textContent = "提交订单"; }
  });
  el("adminLoginForm").addEventListener("submit", async function (event) {
    event.preventDefault(); var form = event.currentTarget; var button = form.querySelector("button"); button.disabled = true; setError("adminLoginError", "");
    try { await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: form.elements.password.value }) }); form.reset(); await showAdmin(); }
    catch (error) { setError("adminLoginError", error.message); } finally { button.disabled = false; }
  });
  el("adminLogoutBtn").addEventListener("click", async function () { try { await api("/api/admin/logout", { method: "POST", body: "{}" }); } catch (_) {} closeModal("adminModal"); if (!currentUser()) openModal("userLoginModal"); toast("已退出后台"); });
  el("dishForm").addEventListener("submit", async function (event) {
    event.preventDefault(); var form = event.currentTarget; var button = form.querySelector('[type="submit"]'); button.disabled = true; button.textContent = "正在保存…"; setError("dishFormError", "");
    var id = form.elements.id.value; var payload = { name: form.elements.name.value, categoryId: form.elements.categoryId.value, priceCents: Math.round(Number(form.elements.price.value) * 100), sortOrder: Number(form.elements.sortOrder.value), imageUrl: form.elements.imageUrl.value, description: form.elements.description.value, available: form.elements.available.checked };
    try { var imageFile = form.elements.imageFile.files[0]; if (imageFile) { button.textContent = "正在上传图片…"; payload.imageUrl = await uploadImage(imageFile); } button.textContent = "正在保存菜品…"; await api(id ? "/api/admin/dishes/" + encodeURIComponent(id) : "/api/admin/dishes", { method: id ? "PATCH" : "POST", body: JSON.stringify(payload) }); closeModal("dishEditorModal"); await loadAdminData(); renderAdmin(); await loadMenu(); toast(id ? "菜品与图片已更新" : "菜品与图片已保存"); }
    catch (error) { setError("dishFormError", error.message); } finally { button.disabled = false; button.textContent = "保存菜品"; }
  });
  addEventListener("resize", renderCart);
  el("dishGrid").innerHTML = loading();
  updateUserUI();
  if (!currentUser()) openModal("userLoginModal");
  loadMenu().then(registerWebMCP).catch(function () {});
})();
