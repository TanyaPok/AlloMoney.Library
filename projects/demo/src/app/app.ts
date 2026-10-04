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
    protected readonly title = signal('AlloMoney Library Demo');
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
            {id: 0, name: "Bank Account 1", value: 365000},
            {id: 1, name: "Bank Account 2", value: 150369},
            {id: 2, name: "Investment Account 1"},
            {id: 3, name: "Investment Account 2"},
            {id: 4, name: "Special Account 1", value: 10000},
            {id: 5, value: 550}
        ],
        links: [
            {source: 0, target: 2, value: 100000},
            {source: 0, target: 2, value: 5000.505},
            {source: 2, target: 0, value: 50000},
            {source: 0, target: 3, value: 50000},
            {source: 1, target: 3, value: 0},
            {source: 1, target: 4, value: 11000},
            {source: 4, target: 0, value: 500},
        ]
    });

    options: SankeyOptions = {
        theme: "light",
        noDataMessage: "No Money Flow Data",
        //width: 1200,
        //height: 400,
        orientation: "horizontal",
        horizontalScrolling: true,
        verticalScrolling: true,
        canEditNodeName: true,
        canEditNodeValue: true,
        currency: 'USD',
        canEditLinkValue: true,
        canEditLinkSource: true,
        canEditLinkTarget: true,
        canAggregateLinks: true,
        maxDisplayedNodeName: 20,
        legend: {
            visibility: true,
            location: 'bottom',
            isFullLegendShown: true,
            inLabel: "",
            outLabel: "",
        },
    };
}
