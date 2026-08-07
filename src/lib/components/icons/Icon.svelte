<script lang="ts">
  import { icons, type IconName } from './icons';

  export let name: IconName;
  export let size: number | string = 24;
  export let color: string = 'currentColor';
  export let className: string = '';

  $: icon = icons[name];
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
