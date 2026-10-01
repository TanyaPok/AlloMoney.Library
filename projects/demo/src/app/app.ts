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

    // protected readonly data = signal<SankeyData | null | undefined>({
    //     nodes: [
    //         {id: 0},
    //         {id: 1},
    //         {id: 2},
    //         {id: 3},
    //         {id: 4},
    //         ...Array.from({length: 123}, (_, i) => ({
    //             id: i + 5
    //         })),
    //         {id: 500},
    //         {id: 501},
    //         {id: 502},
    //     ],
    //     links: [
    //         {source: 0, target: 1, value: 100},
    //         {source: 2, target: 1, value: 10},
    //         {source: 3, target: 1, value: 23.50},
    //         {source: 1, target: 4, value: 100},
    //         ...Array.from({length: 123}, (_, i) => ({
    //             source: i + 5,
    //             target: i + 6,
    //             value: 5
    //         }))
    //     ]
    // });
    // protected readonly data = signal<SankeyData | null | undefined>(null);
    protected readonly data = signal<SankeyData | null | undefined>({
        nodes: [
            {id: 0},
            {id: 1},
            {id: 2},
            {id: 3},
            {id: 4, name: "qwer"},
            {id: 5},
            {id: 6}
        ],
        links: [
            // {source: 0, target: 1, value: 1},
            {source: 0, target: 1, value: 1},
            // {source: 0, target: 3, value: 1},
            // {source: 0, target: 4, value: 1},

            {source: 2, target: 0, value: 1},
            {source: 2, target: 0, value: 0.5},

            // {source: 2, target: 1, value: 1},
            // {source: 5, target: 6, value: 1},
            //
            // {source: 4, target: 7, value: 1},
            //
            // {source: 6, target: 5, value: 1},
            // {source: 5, target: 0, value: 1},
            // {source: 0, target: 5, value: 1},
        ]
    });

    options: SankeyOptions = {
        //theme: "dark",
        noDataMessage: "No Money Flow Data",
        //width: 200,
        //height: 200,

        //orientation: "vertical",
        //height: 1500
        //horizontalScrolling: true,
        //verticalScrolling: true,
        canEditNodeName: true,
        canEditNodeValue: true,
        currency: 'USD',
        //canEditLinkValue: true,
        canEditLinkSource: true,
        canEditLinkTarget: true,
        canAggregateLinks: false,
    };
}
