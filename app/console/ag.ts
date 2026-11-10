'use client';

// AG Grid and AG Charts need their modules registered once, on the client, before first use.
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { AllCommunityModule as ChartsModules, ModuleRegistry as ChartsRegistry } from 'ag-charts-community';

let done = false;

export function registerAg(): void {
  if (done) return;
  ModuleRegistry.registerModules([AllCommunityModule]);
  ChartsRegistry.registerModules([ChartsModules]);
  done = true;
}
