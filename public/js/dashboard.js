async function loadDashboard() {
  try {
    const response = await fetch('/api/dashboard/stats');

    if (!response.ok) {
      window.location.href = '/login.html';
      return;
    }

    const data = await response.json();

    document.getElementById('totalGroceries').textContent = data.totalGroceries || 0;
    document.getElementById('freshCount').textContent = data.fresh || 0;
    document.getElementById('expiringSoonCount').textContent = data.expiringSoon || 0;
    document.getElementById('expiredCount').textContent = data.expired || 0;

    const notificationCount = document.getElementById('notificationCount');
    const notificationPanel = document.getElementById('notificationPanel');
    const expiringItems = data.expiringSoonItems || [];

    if (notificationCount) {
      notificationCount.textContent = data.expiringSoon || 0;
    }

    if (notificationPanel) {
      if (!expiringItems.length) {
        notificationPanel.innerHTML = '<p class="notification-heading">Expiry alerts</p><div class="notification-item empty">Nothing is expiring soon.</div>';
      } else {
        notificationPanel.innerHTML = `<p class="notification-heading">Expiring soon</p>${expiringItems.map((item) => `
          <div class="notification-item">
            <strong>${escapeDashboardText(item.name)}</strong>
            <span>Expires on ${new Date(item.expiryDate).toLocaleDateString()}</span>
          </div>
        `).join('')}`;
      }
    }

    renderList('recentGroceries', data.recentlyAdded || [], 'recent');
    renderList('expiringSoonList', data.expiringSoonItems || [], 'expiring');
  } catch (error) {
    console.error('Dashboard loading failed:', error);
    window.location.href = '/login.html';
  }
}

function escapeDashboardText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderList(containerId, items, type) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!items.length) {
    container.innerHTML = type === 'expiring'
      ? '<div class="dashboard-empty">Nothing to use urgently. Your kitchen is in good shape.</div>'
      : '<div class="dashboard-empty">No groceries added yet.</div>';
    return;
  }

  let html = '';

  if (type === 'recent') {
    html = items.map((item) => `
      <div class="list-item recent-item">
        <span class="recent-item-icon" aria-hidden="true">${getDashboardCategoryIcon(item.category)}</span>
        <div class="recent-item-copy">
          <strong>${escapeDashboardText(item.name)}</strong>
          <div class="muted-text">${escapeDashboardText(item.quantity)} ${escapeDashboardText(item.unit || 'pcs')} · ${escapeDashboardText(item.category || 'Other')}</div>
        </div>
        <span class="recent-item-date">Added ${new Date(item.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      </div>
    `).join('');
  } else {
    html = items.map((item) => `
      <div class="list-item">
        <div>
          <strong>${escapeDashboardText(item.name)}</strong>
          <div class="muted-text">Expires ${new Date(item.expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
        </div>
        <span class="status-badge expiring">Expiring Soon</span>
      </div>
    `).join('');
  }

  container.innerHTML = html;
}

function getDashboardCategoryIcon(category) {
  const icons = {
    Bakery: '🥖', Beverages: '🥤', Dairy: '🥛', Frozen: '🧊',
    Fruits: '🍎', Meat: '🥩', Other: '🛒', Pantry: '🥫',
    Snacks: '🍿', Vegetables: '🥬', Household: '🧽'
  };
  return icons[category] || '🛒';
}

async function loadUserProfile() {
  try {
    const response = await fetch('/api/session');
    if (!response.ok) return;

    const data = await response.json();
    const userName = data.user?.name || 'there';
    const userNameDisplay = document.getElementById('userNameDisplay');
    const dashboardDate = document.getElementById('dashboardDate');

    if (userNameDisplay) {
      userNameDisplay.textContent = userName;
    }

    if (dashboardDate) {
      dashboardDate.textContent = new Intl.DateTimeFormat('en', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      }).format(new Date()).toUpperCase();
    }
  } catch (error) {
    console.error('Failed to load user profile:', error);
  }
}

const notificationBtn = document.getElementById('notificationBtn');
const notificationPanel = document.getElementById('notificationPanel');

if (notificationBtn && notificationPanel) {
  notificationBtn.addEventListener('click', () => {
    notificationPanel.classList.toggle('hidden');
    notificationBtn.setAttribute('aria-expanded', String(!notificationPanel.classList.contains('hidden')));
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.notification-action')) {
      notificationPanel.classList.add('hidden');
      notificationBtn.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      notificationPanel.classList.add('hidden');
      notificationBtn.setAttribute('aria-expanded', 'false');
    }
  });
}

loadUserProfile();
loadDashboard();
