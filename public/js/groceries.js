let groceries = [];
const editGroceryDialog = document.getElementById('editGroceryDialog');
const editGroceryForm = document.getElementById('editGroceryForm');
const editGroceryMessage = document.getElementById('editGroceryMessage');
let editingGroceryId = null;

function formatDate(dateValue) {
  if (!dateValue) return '—';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

function getStatusBadge(status) {
  const lowerStatus = status ? status.toLowerCase() : 'fresh';
  if (lowerStatus.includes('expired')) {
    return '<span class="status-badge expired">Expired</span>';
  }
  if (lowerStatus.includes('expiring')) {
    return '<span class="status-badge expiring">Expiring Soon</span>';
  }
  return '<span class="status-badge fresh">Fresh</span>';
}

function getStatusTone(status) {
  const normalizedStatus = (status || '').toLowerCase();
  if (normalizedStatus.includes('expired')) return 'expired';
  if (normalizedStatus.includes('expiring')) return 'expiring';
  return 'fresh';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getDaysRemaining(dateValue) {
  if (!dateValue) return 'No expiry date';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiryDate = new Date(dateValue);
  expiryDate.setHours(0, 0, 0, 0);
  const days = Math.ceil((expiryDate - today) / 86400000);

  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return 'Expires today';
  return `${days} days left`;
}

function getCategoryIcon(category) {
  const icons = {
    Bakery: '🥖', Beverages: '🥤', Dairy: '🥛', Frozen: '🧊',
    Fruits: '🍎', Meat: '🥩', Other: '🛒', Pantry: '🥫',
    Snacks: '🍿', Vegetables: '🥬', Household: '🧽'
  };
  return icons[category] || '🛒';
}

async function fetchGroceries() {
  try {
    const response = await fetch('/api/groceries');
    if (!response.ok) {
      window.location.href = '/login.html';
      return [];
    }
    groceries = await response.json();
    return groceries;
  } catch (error) {
    console.error('Failed to load groceries:', error);
    return [];
  }
}

function applyFilters() {
  const searchText = document.getElementById('searchInput').value.trim().toLowerCase();
  const categoryFilter = document.getElementById('categoryFilter').value;
  const statusFilter = document.getElementById('statusFilter').value;

  const filteredItems = groceries.filter((item) => {
    const matchesText = !searchText || item.name.toLowerCase().includes(searchText);
    const matchesCategory = !categoryFilter || item.category === categoryFilter;
    const matchesStatus = !statusFilter || item.status === statusFilter;
    return matchesText && matchesCategory && matchesStatus;
  });

  renderCards(filteredItems);
}

function renderCards(items) {
  const container = document.getElementById('groceriesGrid');
  const countLabel = document.getElementById('groceryCount');
  const categorySelect = document.getElementById('categoryFilter');
  const selectedCategory = categorySelect.value;
  const categoryOptions = [...new Set(groceries.map((item) => item.category).filter(Boolean))];

  categorySelect.innerHTML = '<option value="">All Categories</option>' +
    categoryOptions.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
  categorySelect.value = selectedCategory;

  if (countLabel) {
    countLabel.textContent = `${items.length} ${items.length === 1 ? 'item' : 'items'}`;
  }

  if (!items.length) {
    container.innerHTML = '<div class="empty-state">No groceries found.</div>';
    return;
  }

  const cards = items.map((item) => `
    <article class="grocery-card">
      <div class="grocery-card-top">
        <span class="grocery-item-icon" aria-hidden="true">${getCategoryIcon(item.category)}</span>
        <div>
          <h3>${escapeHtml(item.name)}</h3>
          <p class="grocery-card-category">${escapeHtml(item.category)}</p>
        </div>
        ${getStatusBadge(item.status)}
      </div>

      <div class="grocery-metrics">
        <div><small>Quantity</small><strong>${escapeHtml(item.quantity)} ${escapeHtml(item.unit || 'pcs')}</strong></div>
        <div><small>Purchase date</small><strong>${formatDate(item.purchaseDate)}</strong></div>
      </div>

      <div class="grocery-meta">
        <div><small>Expiry date</small><strong>${formatDate(item.expiryDate)}</strong></div>
        <div><small>Days remaining</small><strong>${getDaysRemaining(item.expiryDate)}</strong></div>
      </div>

      <div class="grocery-card-footer">
        <span class="grocery-status-line ${getStatusTone(item.status)}">${escapeHtml(item.status || 'Fresh')}</span>
        <div class="table-actions">
          <button class="inline-btn edit" type="button" data-id="${item._id}">Edit</button>
          <button class="inline-btn delete" type="button" data-id="${item._id}">Delete</button>
        </div>
      </div>
    </article>
  `).join('');

  container.innerHTML = cards;

  document.querySelectorAll('.inline-btn.edit').forEach((button) => {
    button.addEventListener('click', () => handleEdit(button.dataset.id));
  });

  document.querySelectorAll('.inline-btn.delete').forEach((button) => {
    button.addEventListener('click', () => handleDelete(button.dataset.id));
  });
}

async function handleEdit(id) {
  const item = groceries.find((entry) => entry._id === id);
  if (!item) return;

  editingGroceryId = id;
  editGroceryMessage.textContent = '';
  editGroceryForm.elements.name.value = item.name || '';
  editGroceryForm.elements.quantity.value = item.quantity ?? '';
  editGroceryForm.elements.unit.value = item.unit || 'pcs';
  editGroceryForm.elements.purchaseDate.value = String(item.purchaseDate || '').slice(0, 10);
  editGroceryForm.elements.expiryDate.value = String(item.expiryDate || '').slice(0, 10);
  editGroceryForm.elements.price.value = item.price ?? '';

  const categorySelect = editGroceryForm.elements.category;
  if (![...categorySelect.options].some((option) => option.value === item.category)) {
    categorySelect.add(new Option(item.category, item.category));
  }
  categorySelect.value = item.category || 'Other';
  editGroceryDialog.showModal();
}

editGroceryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!editingGroceryId) return;

  const saveButton = editGroceryForm.querySelector('[type="submit"]');
  const payload = {
    name: editGroceryForm.elements.name.value.trim(),
    category: editGroceryForm.elements.category.value,
    quantity: Number(editGroceryForm.elements.quantity.value),
    unit: editGroceryForm.elements.unit.value.trim(),
    purchaseDate: editGroceryForm.elements.purchaseDate.value,
    expiryDate: editGroceryForm.elements.expiryDate.value || null,
    price: Number(editGroceryForm.elements.price.value)
  };

  saveButton.disabled = true;
  editGroceryMessage.textContent = '';

  try {
    const response = await fetch(`/api/groceries/${editingGroceryId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Unable to update grocery.');
    }

    editGroceryDialog.close();
    editingGroceryId = null;
    await fetchGroceries();
    applyFilters();
  } catch (error) {
    editGroceryMessage.textContent = error.message || 'Unable to update grocery.';
  } finally {
    saveButton.disabled = false;
  }
});

document.getElementById('closeEditDialog').addEventListener('click', () => editGroceryDialog.close());
document.getElementById('cancelEditDialog').addEventListener('click', () => editGroceryDialog.close());

async function handleDelete(id) {
  const confirmDelete = window.confirm('Are you sure you want to delete this grocery?');
  if (!confirmDelete) return;

  try {
    const response = await fetch(`/api/groceries/${id}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok) {
      alert(result.message || 'Unable to delete grocery');
      return;
    }

    alert('Grocery deleted successfully.');
    await fetchGroceries();
    applyFilters();
  } catch (error) {
    console.error('Delete failed:', error);
    alert('Unable to delete grocery.');
  }
}

document.getElementById('searchInput').addEventListener('input', applyFilters);
document.getElementById('categoryFilter').addEventListener('change', applyFilters);
document.getElementById('statusFilter').addEventListener('change', applyFilters);

async function initializeGroceriesPage() {
  const data = await fetchGroceries();
  renderCards(data);
}

initializeGroceriesPage();
