import App from './App.svelte';
import './styles.css';
import { mount } from 'svelte';

const target = document.getElementById('app');

if (!target) {
  throw new Error('missing #app mount point');
}

mount(App, { target });
