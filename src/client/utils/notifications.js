/**
 * Notification system utilities
 */

/**
 * Show a notification to the user
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} [type='info']
 * @param {Object} [options]
 * @param {number} [options.duration=3000]
 * @param {'top'|'bottom'} [options.position='top']
 */
export function showNotification(message, type = 'info', options = {}) {
  const { duration = 3000, position = 'top' } = options;

  // Check for existing notification container
  let container = document.getElementById('notification-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'notification-container';
    container.style.cssText = `
      position: fixed;
      ${position}: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(container);
  }

  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    background: ${getBackgroundColor(type)};
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    opacity: 0;
    transform: translateY(${position === 'top' ? '-20px' : '20px'});
    transition: all 0.3s ease;
    pointer-events: auto;
  `;

  container.appendChild(notification);

  // Animate in
  requestAnimationFrame(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateY(0)';
  });

  // Auto-remove after duration
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = `translateY(${position === 'top' ? '-20px' : '20px'})`;
    setTimeout(() => {
      notification.remove();
      // Remove container if empty
      if (container && container.children.length === 0) {
        container.remove();
      }
    }, 300);
  }, duration);
}

function getBackgroundColor(type) {
  switch (type) {
    case 'success':
      return '#27ae60';
    case 'error':
      return '#e74c3c';
    case 'warning':
      return '#f39c12';
    case 'info':
    default:
      return '#3498db';
  }
}

/**
 * Show confirmation dialog
 * @param {string} message
 * @param {string} [title='Confirm']
 * @returns {Promise<boolean>}
 */
export function showConfirm(message, title = 'Confirm') {
  return new Promise((resolve) => {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10001;
    `;

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'confirm-modal';
    modal.innerHTML = `
      <h3 style="margin: 0 0 15px; color: #fff;">${title}</h3>
      <p style="margin: 0 0 20px; color: #ccc;">${message}</p>
      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button class="btn btn-secondary cancel-btn">Cancel</button>
        <button class="btn btn-primary confirm-btn">Confirm</button>
      </div>
    `;
    modal.style.cssText = `
      background: #1a1a2e;
      padding: 24px;
      border-radius: 12px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Handle buttons
    const confirmBtn = modal.querySelector('.confirm-btn');
    const cancelBtn = modal.querySelector('.cancel-btn');

    const cleanup = () => {
      overlay.remove();
    };

    confirmBtn?.addEventListener('click', () => {
      cleanup();
      resolve(true);
    });

    cancelBtn?.addEventListener('click', () => {
      cleanup();
      resolve(false);
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(false);
      }
    });

    // Close on Escape
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        cleanup();
        resolve(false);
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  });
}
