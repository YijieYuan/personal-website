// Simple script that grabs the current date and fills in the "Last Updated" span.
window.addEventListener('DOMContentLoaded', () => {
    const dateSpan = document.getElementById('update-date');
    if (dateSpan) {
      // Format date as desired, e.g. "2/3/2025"
      const today = new Date().toLocaleDateString();
      dateSpan.textContent = today;
    }
  });
  

async function updateLastModifiedDate() {
  try {
      // Get the current HTML file name
      const pathArray = window.location.pathname.split('/');
      const currentFile = pathArray[pathArray.length - 1] || 'index.html';
      
      // Read the file's metadata
      const response = await window.fs.readFile(currentFile);
      const lastModified = await window.fs.stat(currentFile);
      
      // Format the date
      const date = new Date(lastModified.mtime);
      const formattedDate = date.toLocaleDateString();
      
      // Update the element
      document.getElementById('update-date').textContent = formattedDate;
  } catch (error) {
      console.error('Error getting file modification date:', error);
      document.getElementById('update-date').textContent = 'Unknown';
  }
}

// Call the function when the page loads
updateLastModifiedDate();