window.addEventListener('load', function () {
  const container = document.querySelector('body .topbar');
  if (!container) return;
  const link = document.createElement('a');
  link.href = 'swagger.json';
  link.innerText = 'Download swagger.json';
  link.style.marginLeft = '10px';
  container.appendChild(link);
});
