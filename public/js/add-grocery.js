const form = document.getElementById('addGroceryForm');
const messageBox = document.getElementById('addGroceryMessage');

function showMessage(message, type = 'success') {
  messageBox.textContent = message;
  messageBox.className = `form-message ${type}`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const payload = {
    name: formData.get('name').trim(),
    category: formData.get('category').trim(),
    quantity: Number(formData.get('quantity')),
    unit: 'pcs',
    purchaseDate: formData.get('purchaseDate'),
    expiryDate: formData.get('expiryDate') || null,
    price: Number(formData.get('price'))
  };

  try {
    const response = await fetch('/api/groceries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      showMessage(result.message || 'Please check the form values.', 'error');
      return;
    }

    showMessage('Grocery added successfully! Redirecting to My Groceries...');
    setTimeout(() => {
      window.location.href = '/groceries.html';
    }, 800);
  } catch (error) {
    console.error('Add grocery failed:', error);
    showMessage('Unable to save grocery. Please try again.', 'error');
  }
});
