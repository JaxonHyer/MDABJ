import { Territory, Power } from '../types/game';
import territoriesData from './territories.json';

export function loadTerritories(): Record<string, Territory> {
  return territoriesData.territories as unknown as Record<string, Territory>;
}

export function loadPowers(): Power[] {
  
  return [
    {
      id: 'athens',
      name: 'Athens',
      color: '#4CAF50',
      homeCenters: ['athens', 'piraeus', 'rhodes', 'crete'],
      startingUnits: [
        { id: 'athens_army_1', power: 'athens', type: 'army', territoryId: 'athens', isElite: false },
        { id: 'athens_fleet_1', power: 'athens', type: 'fleet', territoryId: 'rhodes', isElite: false },
        { id: 'athens_fleet_2', power: 'athens', type: 'fleet', territoryId: 'crete', isElite: false },
        { id: 'athens_caravan_1', power: 'athens', type: 'caravan', territoryId: 'piraeus', isElite: false },
      ],
      startingEco: 4,
    },
    {
      id: 'sparta',
      name: 'Sparta',
      color: '#2196F3',
      homeCenters: ['sparta', 'corinth'],
      startingUnits: [
        { id: 'sparta_army_1', power: 'sparta', type: 'army', territoryId: 'corinth', isElite: false },
        { id: 'sparta_army_2', power: 'sparta', type: 'army', territoryId: 'sparta', isElite: true }, // Elite Hoplites
      ],
      startingEco: 2,
    },
    {
      id: 'macedon',
      name: 'Macedon',
      color: '#D2B48C',
      homeCenters: ['macedon', 'thessaly', 'thrace'],
      startingUnits: [
        { id: 'macedon_army_1', power: 'macedon', type: 'army', territoryId: 'macedon', isElite: false },
        { id: 'macedon_army_2', power: 'macedon', type: 'army', territoryId: 'thessaly', isElite: false },
        { id: 'macedon_fleet_1', power: 'macedon', type: 'fleet', territoryId: 'thrace', isElite: false },
      ],
      startingEco: 2,
    },
    {
      id: 'satrapies',
      name: 'Satrapies',
      color: '#FF9800',
      homeCenters: ['bithynia', 'galatia', 'miletus'],
      startingUnits: [
        { id: 'satrapies_army_1', power: 'satrapies', type: 'army', territoryId: 'galatia', isElite: false },
        { id: 'satrapies_army_2', power: 'satrapies', type: 'army', territoryId: 'miletus', isElite: false },
        { id: 'satrapies_fleet_1', power: 'satrapies', type: 'fleet', territoryId: 'bithynia', isElite: false },
        { id: 'satrapies_caravan_1', power: 'satrapies', type: 'caravan', territoryId: 'galatia', isElite: false },
      ],
      startingEco: 3,
    },
    {
      id: 'persia',
      name: 'Persia',
      color: '#795548',
      homeCenters: ['damascus', 'petra', 'alexandria'],
      startingUnits: [
        { id: 'persia_army_1', power: 'persia', type: 'army', territoryId: 'damascus', isElite: false },
        { id: 'persia_army_2', power: 'persia', type: 'army', territoryId: 'petra', isElite: false },
        { id: 'persia_fleet_1', power: 'persia', type: 'fleet', territoryId: 'alexandria', isElite: false },
        { id: 'persia_caravan_1', power: 'persia', type: 'caravan', territoryId: 'damascus', isElite: false },
      ],
      startingEco: 6,
    },
    {
      id: 'phoenicia',
      name: 'Phoenicia',
      color: '#9C27B0',
      homeCenters: ['sidon', 'tyre', 'cyprus'],
      startingUnits: [
        { id: 'phoenicia_fleet_1', power: 'phoenicia', type: 'fleet', territoryId: 'cyprus', isElite: false },
        { id: 'phoenicia_fleet_2', power: 'phoenicia', type: 'fleet', territoryId: 'sidon', isElite: false },
        { id: 'phoenicia_army_1', power: 'phoenicia', type: 'army', territoryId: 'tyre', isElite: false },
        { id: 'phoenicia_caravan_1', power: 'phoenicia', type: 'caravan', territoryId: 'sidon', isElite: false },
      ],
      startingEco: 5,
    },
    {
      id: 'carthage',
      name: 'Carthage',
      color: '#FFEB3B',
      homeCenters: ['carthage', 'thopsis', 'maraka'],
      startingUnits: [
        { id: 'carthage_fleet_1', power: 'carthage', type: 'fleet', territoryId: 'thopsis', isElite: false },
        { id: 'carthage_fleet_2', power: 'carthage', type: 'fleet', territoryId: 'maraka', isElite: false },
        { id: 'carthage_army_1', power: 'carthage', type: 'army', territoryId: 'carthage', isElite: false },
        { id: 'carthage_caravan_1', power: 'carthage', type: 'caravan', territoryId: 'carthage', isElite: false },
      ],
      startingEco: 4,
    },
    {
      id: 'rome',
      name: 'Rome',
      color: '#F44336',
      homeCenters: ['rome', 'ravenna', 'neapolis'],
      startingUnits: [
        { id: 'rome_army_1', power: 'rome', type: 'army', territoryId: 'rome', isElite: false },
        { id: 'rome_army_2', power: 'rome', type: 'army', territoryId: 'ravenna', isElite: false },
      ],
      startingEco: 2,
    },
  ];
}
