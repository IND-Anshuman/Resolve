'use client';

// AG Grid and AG Charts need their modules registered once, on the client, before first use.
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import { AllCommunityModule as ChartsModules, ModuleRegistry as ChartsRegistry } from 'ag-charts-community';

let done = false;

// One grid theme for every table in the console, tuned to the app's tokens.
export const gridTheme = themeQuartz.withParams({
  accentColor: '#5b4ff5',
  foregroundColor: '#14132b',
  borderColor: '#e6e5f0',
  backgroundColor: 'transparent',
  headerBackgroundColor: '#f6f6fb',
  headerTextColor: '#6b6b80',
  headerFontWeight: 500,
  rowHoverColor: 'rgba(91, 79, 245, 0.05)',
  selectedRowBackgroundColor: 'rgba(91, 79, 245, 0.08)',
  fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
  wrapperBorder: false,
  wrapperBorderRadius: 0,
});

// Chart palette shared by the Results tab.
export const CHART = { accent: '#5b4ff5', accent2: '#8b5cf6', good: '#16794a', warn: '#c2851a' } as const;

export function registerAg(): void {
  if (done) return;
  ModuleRegistry.registerModules([AllCommunityModule]);
  ChartsRegistry.registerModules([ChartsModules]);
  done = true;
}
