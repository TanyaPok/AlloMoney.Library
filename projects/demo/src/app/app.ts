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
            {id: 0, name: "Account 0"},
            {id: 1, name: "Account 1"},
            {id: 2, name: "Account 2"},
            {id: 3},
            {id: 4, name: "Account 4"},
            {id: 5, name: "Account 5"}
        ],
        links: [
            {source: 0, target: 1, value: 100},
            {source: 0, target: 1, value: 50},
            {source: 1, target: 0, value: 25},

            {source: 1, target: 2, value: 25},
            {source: 2, target: 1, value: 20},

            {source: 3, target: 4, value: 250},
            {source: 4, target: 5, value: 250},
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
        currency: 'CAD',
        canEditLinkValue: true,
        canEditLinkSource: true,
        canEditLinkTarget: true,
        canAggregateLinks: false,
        canAddLink: true,
        hideLinkValue: false,
        maxDisplayedNodeName: 20,
        legend: {
            visibility: true,
            location: 'bottom',
            isFullLegendShown: true,
            inLabel: "In",
            outLabel: "Out",
        },
    };
}
