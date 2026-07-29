import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { AllomoneySankeyDiagram, type SankeyData } from 'allomoney-library';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AllomoneySankeyDiagram],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('AlloMoney Library demo');

  /**
   * Left empty on purpose so the demo exercises the themed empty state in both
   * light and dark. Populate with real nodes/links once the Sankey renderer
   * lands to preview a live diagram.
   */
  protected readonly data = signal<SankeyData | undefined>(undefined);
}