const isAuthPage = window.location.pathname.includes('login.html') || window.location.pathname.includes('signup.html');

function showMessage(elementId, message, type = 'error') {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = message;
  element.className = `form-message ${type}`;
}

async function handleAuthSubmit(event, endpoint, formId, successPage) {
  event.preventDefault();
  const form = document.getElementById(formId);
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      const errorElementId = formId === 'signupForm' ? 'signupError' : 'loginError';
      showMessage(errorElementId, result.message || 'Something went wrong.', 'error');
      return;
    }

    const targetMessage = formId === 'signupForm' ? 'signupError' : 'loginError';
    const element = document.getElementById(targetMessage);
    if (element) {
      element.textContent = '';
      element.className = 'form-message';
    }

    window.location.href = successPage;
  } catch (error) {
    console.error('Auth error:', error);
    const errorElementId = formId === 'signupForm' ? 'signupError' : 'loginError';
    showMessage(errorElementId, 'Unable to connect to server. Please try again.', 'error');
  }
}

if (document.getElementById('signupForm')) {
  document.getElementById('signupForm').addEventListener('submit', async (event) => {
    await handleAuthSubmit(event, '/api/signup', 'signupForm', '/dashboard.html');
  });
}

if (document.getElementById('loginForm')) {
  document.getElementById('loginForm').addEventListener('submit', async (event) => {
    await handleAuthSubmit(event, '/api/login', 'loginForm', '/dashboard.html');
  });
}

document.querySelectorAll('[data-logout="true"]').forEach((logoutButton) => {
  logoutButton.addEventListener('click', async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/login.html';
    } catch (error) {
      console.error('Logout failed:', error);
      window.location.href = '/login.html';
    }
  });
});

if (isAuthPage) {
  fetch('/api/groceries', { method: 'GET' })
    .then((response) => {
      if (response.ok) {
        window.location.href = '/dashboard.html';
      }
    })
    .catch(() => {
      // Ignore if not logged in
    });
}
