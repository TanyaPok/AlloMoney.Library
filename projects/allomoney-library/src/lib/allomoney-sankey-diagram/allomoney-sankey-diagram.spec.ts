import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AllomoneySankeyDiagram } from './allomoney-sankey-diagram';
import type { SankeyData } from './models/sankey-data';

describe('AllomoneySankeyDiagram', () => {
  let fixture: ComponentFixture<AllomoneySankeyDiagram>;
  let component: AllomoneySankeyDiagram;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AllomoneySankeyDiagram],
    }).compileComponents();

    fixture = TestBed.createComponent(AllomoneySankeyDiagram);
    component = fixture.componentInstance;
  });

  it('creates', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('reports empty when no data is supplied', () => {
    fixture.detectChanges();
    expect(component.isEmpty()).toBe(true);
    const empty = fixture.nativeElement.querySelector('.allomoney-sankey__empty');
    expect(empty).not.toBeNull();
  });

  it('reports empty when nodes or links are missing', () => {
    fixture.componentRef.setInput('data', { nodes: [], links: [] } as SankeyData);
    fixture.detectChanges();
    expect(component.isEmpty()).toBe(true);
  });

  it('defaults the theme to light', () => {
    fixture.detectChanges();
    expect(component.theme()).toBe('light');
    expect(fixture.nativeElement.getAttribute('data-theme')).toBe('light');
  });

  it('reflects the theme input onto the host', () => {
    fixture.componentRef.setInput('theme', 'dark');
    fixture.detectChanges();
    expect(fixture.nativeElement.getAttribute('data-theme')).toBe('dark');
  });

  it('is not empty once nodes and links are present', () => {
    const data: SankeyData = {
      nodes: [
        { id: 'a', label: 'Income' },
        { id: 'b', label: 'Rent' },
      ],
      links: [{ source: 'a', target: 'b', value: 100 }],
    };
    fixture.componentRef.setInput('data', data);
    fixture.detectChanges();
    expect(component.isEmpty()).toBe(false);
  });
});