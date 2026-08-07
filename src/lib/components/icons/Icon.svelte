<script lang="ts">
  import { icons, type IconName } from './icons';

  let {
    name,
    size = 24,
    color = 'currentColor',
    className = ''
  }: {
    name: IconName;
    size?: number | string;
    color?: string;
    className?: string;
  } = $props();

  let icon = $derived(icons[name]);
</script>

{#if icon}
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox={icon.viewBox}
    width={size}
    height={size}
    fill={color}
    class={className}
    aria-hidden="true"
    role="img"
  >
    {@html icon.body}
  </svg>
{/if}
