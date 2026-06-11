// Login/register screens.
import { api, setToken } from './api.js';

export function initAuth(onLogin) {
  const authScreen = document.getElementById('auth-screen');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const errorBox = document.getElementById('auth-error');

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
  }

  function switchTab(showLogin) {
    loginForm.classList.toggle('hidden', !showLogin);
    registerForm.classList.toggle('hidden', showLogin);
    tabLogin.classList.toggle('active', showLogin);
    tabRegister.classList.toggle('active', !showLogin);
    errorBox.classList.add('hidden');
  }

  tabLogin.addEventListener('click', () => switchTab(true));
  tabRegister.addEventListener('click', () => switchTab(false));

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { token, player } = await api.login(
        document.getElementById('login-username').value.trim(),
        document.getElementById('login-password').value
      );
      setToken(token);
      authScreen.classList.add('hidden');
      onLogin(player);
    } catch (err) {
      showError(err.message);
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { token, player } = await api.register(
        document.getElementById('register-username').value.trim(),
        document.getElementById('register-email').value.trim(),
        document.getElementById('register-password').value
      );
      setToken(token);
      authScreen.classList.add('hidden');
      onLogin(player);
    } catch (err) {
      showError(err.message);
    }
  });

  return {
    show() { authScreen.classList.remove('hidden'); }
  };
}
