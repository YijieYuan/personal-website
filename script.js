// Simple script that grabs the current date and fills in the "Last Updated" span.
window.addEventListener('DOMContentLoaded', () => {
    const dateSpan = document.getElementById('update-date');
    if (dateSpan) {
      // Format date as desired, e.g. "2/3/2025"
      const today = new Date().toLocaleDateString();
      dateSpan.textContent = today;
    }
  });
  