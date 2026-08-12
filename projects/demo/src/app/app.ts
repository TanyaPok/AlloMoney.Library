import {ChangeDetectionStrategy, Component, signal} from '@angular/core';
import {AllomoneySankeyDiagram, type SankeyData} from 'allomoney-library';

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
     * The UC-1 reference payload from REQUIREMENTS.md (business rule 2). Node 2
     * has no name (falls back to its id) and no value (derived from links);
     * nodes 0 and 3 carry an explicit "total deposit".
     */
    protected readonly data = signal<SankeyData | null | undefined>({
        nodes: [
            {id: 0, name: 'Account 0', value: 10.0},
            {id: 1, name: 'Account 1'},
            {id: 2},
            {id: 3, name: 'Account 3'},
            {id: 4, name: 'Account 3'}
        ],
        links: [
            {source: 0, target: 2, value: 5.5},
            {source: 0, target: 3, value: 4.5},
            {source: 1, target: 2, value: 0.5},
            {source: 2, target: 4, value: 10},
            {source: 3, target: 4, value: 4}
        ],
        currency: 'JPY',
        //orientation: 'vertical'
    });
}
