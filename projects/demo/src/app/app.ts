import {ChangeDetectionStrategy, Component, signal} from '@angular/core';
import {AllomoneySankeyDiagram, type SankeyData, type SankeyOptions} from 'allomoney-library';

@Component({
    selector: 'app-root',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [AllomoneySankeyDiagram],
    templateUrl: './app.html',
    styleUrl: './app.scss',
})
export class App {
    protected readonly title = signal('AlloMoney Library demo');

    protected readonly data = signal<SankeyData | null | undefined>({
        nodes: [
            {id: 0},
            {id: 1},
            {id: 2},
            {id: 3},
            {id: 4},
            ...Array.from({length: 123}, (_, i) => ({
                id: i + 5
            }))
        ],
        links: [
            {source: 0, target: 1, value: 100},
            {source: 2, target: 1, value: 10},
            {source: 3, target: 1, value: 23.50},
            {source: 1, target: 4, value: 100},
            ...Array.from({length: 123}, (_, i) => ({
                source: i + 5,
                target: i + 6,
                value: 5
            }))
        ]
    });

    options: SankeyOptions = {
        theme: "light",
        noDataMessage: "No Money Flow Data",
        orientation: "horizontal",
        height: 1500
        //horizontalScrolling: false,
        //verticalScrolling: true
    };
}
