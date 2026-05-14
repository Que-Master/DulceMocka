// public/ui-dialog.js — custom modal dialogs (alert/confirm/prompt)
(function initUiDialog() {
  if (window.uiDialog) return;

  const STYLE_ID = 'ui-dialog-styles';

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '' +
      '.ui-dialog-backdrop{position:fixed;inset:0;background:rgba(17,24,39,.55);display:flex;align-items:center;justify-content:center;z-index:30000;padding:1rem;}' +
      '.ui-dialog{width:min(460px,96vw);background:#fff;border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.28);border:1px solid #ebe8ff;overflow:hidden;animation:uiDialogIn .16s ease-out;}' +
      '.ui-dialog-head{padding:1rem 1.1rem;border-bottom:1px solid #f0ecff;background:linear-gradient(130deg,#f7f4ff,#ffffff);font-weight:800;color:#2c225a;}' +
      '.ui-dialog-body{padding:1rem 1.1rem;color:#3f3f46;font-size:.95rem;line-height:1.45;white-space:pre-wrap;}' +
      '.ui-dialog-input{width:100%;margin-top:.7rem;border:1.5px solid #d6d0fb;border-radius:10px;padding:.62rem .72rem;font-size:.95rem;outline:none;}' +
      '.ui-dialog-input:focus{border-color:#7b61ff;box-shadow:0 0 0 3px rgba(123,97,255,.14);}' +
      '.ui-dialog-actions{display:flex;justify-content:flex-end;gap:.55rem;padding:0 1.1rem 1rem;}' +
      '.ui-dialog-btn{border:none;border-radius:9px;padding:.56rem .9rem;font-weight:700;cursor:pointer;font-size:.9rem;}' +
      '.ui-dialog-btn.cancel{background:#f4f4f5;color:#27272a;}' +
      '.ui-dialog-btn.ok{background:linear-gradient(100deg,#7b61ff,#9555d6);color:#fff;}' +
      '.ui-dialog-btn.ok:hover{filter:brightness(.98)}' +
      '.ui-dialog-btn.cancel:hover{background:#eaeaec}' +
      '@keyframes uiDialogIn{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}';
    document.head.appendChild(style);
  }

  function createDialog(opts) {
    ensureStyles();

    const config = Object.assign({
      title: 'Mensaje',
      message: '',
      type: 'alert',
      okText: 'Aceptar',
      cancelText: 'Cancelar',
      defaultValue: ''
    }, opts || {});

    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'ui-dialog-backdrop';

      const modal = document.createElement('div');
      modal.className = 'ui-dialog';

      const head = document.createElement('div');
      head.className = 'ui-dialog-head';
      head.textContent = config.title;

      const body = document.createElement('div');
      body.className = 'ui-dialog-body';
      body.textContent = config.message || '';

      let input = null;
      if (config.type === 'prompt') {
        input = document.createElement('input');
        input.className = 'ui-dialog-input';
        input.type = 'text';
        input.value = config.defaultValue || '';
        body.appendChild(input);
      }

      const actions = document.createElement('div');
      actions.className = 'ui-dialog-actions';

      function close(value) {
        document.removeEventListener('keydown', onKeyDown);
        backdrop.remove();
        resolve(value);
      }

      function onKeyDown(e) {
        if (e.key === 'Escape') {
          if (config.type === 'alert') close(undefined);
          else close(null);
        }
        if (e.key === 'Enter') {
          if (config.type === 'alert') close(undefined);
          else if (config.type === 'confirm') close(true);
          else close(input ? input.value : '');
        }
      }

      if (config.type !== 'alert') {
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'ui-dialog-btn cancel';
        cancelBtn.type = 'button';
        cancelBtn.textContent = config.cancelText;
        cancelBtn.addEventListener('click', () => close(null));
        actions.appendChild(cancelBtn);
      }

      const okBtn = document.createElement('button');
      okBtn.className = 'ui-dialog-btn ok';
      okBtn.type = 'button';
      okBtn.textContent = config.okText;
      okBtn.addEventListener('click', () => {
        if (config.type === 'confirm') close(true);
        else if (config.type === 'prompt') close(input ? input.value : '');
        else close(undefined);
      });
      actions.appendChild(okBtn);

      modal.appendChild(head);
      modal.appendChild(body);
      modal.appendChild(actions);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);

      backdrop.addEventListener('click', (e) => {
        if (e.target !== backdrop) return;
        if (config.type === 'alert') close(undefined);
        else close(null);
      });

      document.addEventListener('keydown', onKeyDown);

      if (input) {
        setTimeout(() => {
          input.focus();
          input.select();
        }, 0);
      } else {
        setTimeout(() => okBtn.focus(), 0);
      }
    });
  }

  window.uiDialog = {
    alert(message, title) {
      return createDialog({ type: 'alert', title: title || 'Mensaje', message: message || '', okText: 'Aceptar' });
    },
    confirm(message, title, okText, cancelText) {
      return createDialog({ type: 'confirm', title: title || 'Confirmar', message: message || '', okText: okText || 'Aceptar', cancelText: cancelText || 'Cancelar' });
    },
    prompt(message, defaultValue, title, okText, cancelText) {
      return createDialog({ type: 'prompt', title: title || 'Ingresar dato', message: message || '', defaultValue: defaultValue || '', okText: okText || 'Aceptar', cancelText: cancelText || 'Cancelar' });
    }
  };
})();
