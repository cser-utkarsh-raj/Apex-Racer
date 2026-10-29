/**
 * GarageUI.js — Master 12 Verified Hypercar & Supercar Lineup
 */
export class GarageUI {
    constructor(game) {
        this.game = game;
        this.currentIndex = 0;
        
        this.cars = [
            {
                id: 'gtv_ferrari_laferrari',
                name: 'Ferrari LaFerrari Hybrid V12',
                class: 'Pinnacle Hypercar',
                price: 1400000,
                engine: '6.3L Naturally Aspirated V12 + HY-KERS',
                drivetrain: 'Rear-Wheel Drive (RWD)',
                power: '950 HP • 664 lb-ft',
                trans: '7-Speed Dual-Clutch F1',
                topSpeed: 350,
                accel: 9.9,
                handling: 9.8,
                drift: 9.1
            },
            {
                id: 'gtv_lambo_aventador',
                name: 'Lamborghini Aventador SVJ',
                class: 'V12 Supercar',
                price: 520000,
                engine: '6.5L Naturally Aspirated L539 V12',
                drivetrain: 'All-Wheel Drive (AWD)',
                power: '770 HP • 531 lb-ft',
                trans: '7-Speed ISR Independent Shifting',
                topSpeed: 352,
                accel: 9.8,
                handling: 9.6,
                drift: 8.8
            },
            {
                id: 'gtv_amg_one',
                name: 'Mercedes-AMG One Hypercar',
                class: 'F1 Hypercar',
                price: 2700000,
                engine: '1.6L Turbo Hybrid V6 (Formula 1)',
                drivetrain: 'AMG Performance 4MATIC+ AWD',
                power: '1,049 HP • 11,000 RPM',
                trans: '7-Speed Automated Manual',
                topSpeed: 352,
                accel: 10.0,
                handling: 9.9,
                drift: 8.2
            },
            {
                id: 'gtv_amg_gt63s',
                name: 'Mercedes-AMG GT 63 S 4-Door',
                class: 'Super Sedan',
                price: 170000,
                engine: '4.0L Biturbo M177 V8',
                drivetrain: 'AMG Performance 4MATIC+',
                power: '630 HP • 664 lb-ft',
                trans: '9-Speed AMG SPEEDSHIFT MCT',
                topSpeed: 315,
                accel: 9.1,
                handling: 9.2,
                drift: 8.9
            },
            {
                id: 'gtv_amg_g63',
                name: 'Mercedes-AMG G63 6x6 Edition',
                class: 'Luxury Super SUV',
                price: 280000,
                engine: '5.5L Twin-Turbo V8',
                drivetrain: '6-Wheel Drive (6x6)',
                power: '536 HP • 561 lb-ft',
                trans: '7-Speed AMG 7G-TRONIC',
                topSpeed: 210,
                accel: 7.8,
                handling: 7.2,
                drift: 7.0
            },
            {
                id: 'gtv_ford_gt',
                name: 'Ford GT Le Mans Hypercar',
                class: 'Hypercar',
                price: 450000,
                engine: '3.5L Twin-Turbo EcoBoost V6',
                drivetrain: 'Mid-Engine RWD',
                power: '660 HP • 550 lb-ft',
                trans: '7-Speed Dual-Clutch Getrag',
                topSpeed: 348,
                accel: 9.7,
                handling: 9.7,
                drift: 8.6
            },
            {
                id: 'gtv_ford_mustang_shelby_gt500',
                name: 'Ford Mustang Shelby GT500',
                class: 'Muscle Supercar',
                price: 79000,
                engine: '5.2L Supercharged Predator V8',
                drivetrain: 'Rear-Wheel Drive (RWD)',
                power: '760 HP • 625 lb-ft',
                trans: '7-Speed Tremec Dual-Clutch',
                topSpeed: 290,
                accel: 9.4,
                handling: 8.8,
                drift: 9.6
            },
            {
                id: 'gtv_lamborghini_urus',
                name: 'Lamborghini Urus Performante',
                class: 'Super SUV',
                price: 260000,
                engine: '4.0L Twin-Turbo V8',
                drivetrain: 'Torque-Vectoring AWD',
                power: '657 HP • 627 lb-ft',
                trans: '8-Speed ZF Automatic',
                topSpeed: 306,
                accel: 9.0,
                handling: 8.9,
                drift: 8.5
            },
            {
                id: 'gtv_lambo_revuelto',
                name: 'Lamborghini Revuelto V12 HPEV',
                class: 'Next-Gen Hypercar',
                price: 608000,
                engine: '6.5L NA V12 + 3 Electric Motors',
                drivetrain: 'Electric e-4WD',
                power: '1,001 HP • Hybrid Torque',
                trans: '8-Speed Wet Dual-Clutch',
                topSpeed: 355,
                accel: 10.0,
                handling: 9.9,
                drift: 9.0
            },
            {
                id: 'ferrari_f40',
                name: 'Ferrari F40 Twin-Turbo V8',
                class: 'Legendary Classic',
                price: 1800000,
                engine: '2.9L Twin-Turbo Tipo F120A V8',
                drivetrain: 'Rear-Wheel Drive (RWD)',
                power: '471 HP • 426 lb-ft',
                trans: '5-Speed Gated Manual',
                topSpeed: 324,
                accel: 9.3,
                handling: 9.4,
                drift: 9.3
            },
            {
                id: 'ae86',
                name: 'Toyota Sprinter Trueno AE86',
                class: 'Drift Legend',
                price: 24000,
                engine: '1.6L 4A-GE DOHC Twin-Cam',
                drivetrain: 'Front-Engine RWD',
                power: '128 HP • 105 lb-ft',
                trans: '5-Speed Manual T50',
                topSpeed: 200,
                accel: 7.5,
                handling: 9.9,
                drift: 10.0
            },
            {
                id: 'gtv_ford_bronco_sport',
                name: 'Ford Bronco Sport Badlands 4x4',
                class: 'Off-Road SUV',
                price: 38000,
                engine: '2.0L EcoBoost Turbo I4',
                drivetrain: 'Advanced 4x4 Twin-Clutch',
                power: '250 HP • 277 lb-ft',
                trans: '8-Speed SelectShift Automatic',
                topSpeed: 195,
                accel: 7.2,
                handling: 8.0,
                drift: 7.8
            },
            {
                id: 'gtv_ford_f150',
                name: 'Ford F-150 Raptor SuperCrew',
                class: 'Baja Trophy Truck',
                price: 78000,
                engine: '3.5L High-Output EcoBoost Twin-Turbo V6',
                drivetrain: 'Torque-on-Demand 4WD',
                power: '450 HP • 510 lb-ft',
                trans: '10-Speed SelectShift Automatic',
                topSpeed: 215,
                accel: 7.9,
                handling: 7.5,
                drift: 8.2
            },
            {
                id: 'police_car',
                name: 'Highway Patrol V8 Interceptor',
                class: 'Pursuit Vehicle',
                price: 65000,
                engine: '5.7L HEMI Pursuit V8',
                drivetrain: 'AWD Pursuit Package',
                power: '370 HP • 395 lb-ft',
                trans: '8-Speed Heavy-Duty Automatic',
                topSpeed: 245,
                accel: 8.6,
                handling: 8.7,
                drift: 8.4
            },
            {
                id: 'taxi',
                name: 'Metro City Yellow Cab',
                class: 'Urban Cruiser',
                price: 22000,
                engine: '2.5L Hybrid Dynamic Force I4',
                drivetrain: 'Front-Wheel Drive (FWD)',
                power: '208 HP • 163 lb-ft',
                trans: 'eCVT Planetary Gearset',
                topSpeed: 185,
                accel: 6.8,
                handling: 8.2,
                drift: 7.6
            },
            {
                id: 'school_bus',
                name: 'Classic American School Bus',
                class: 'Heavy Transit',
                price: 85000,
                engine: '6.7L Cummins Turbo Diesel I6',
                drivetrain: 'Rear-Wheel Drive Dual-Dually',
                power: '300 HP • 660 lb-ft',
                trans: 'Allison 2500 PTS 5-Speed',
                topSpeed: 160,
                accel: 5.5,
                handling: 6.0,
                drift: 6.5
            },
            {
                id: 'van',
                name: 'Street Delivery Express Van',
                class: 'Commercial Van',
                price: 32000,
                engine: '3.5L EcoBoost Twin-Turbo V6',
                drivetrain: 'Intelligent All-Wheel Drive',
                power: '310 HP • 400 lb-ft',
                trans: '10-Speed Automatic',
                topSpeed: 190,
                accel: 7.0,
                handling: 7.4,
                drift: 7.9
            }
        ];
    }
    
    getCurrentCar() {
        return this.cars[this.currentIndex];
    }
    
    nextCar() {
        this.currentIndex = (this.currentIndex + 1) % this.cars.length;
        return this.getCurrentCar();
    }
    
    prevCar() {
        this.currentIndex = (this.currentIndex - 1 + this.cars.length) % this.cars.length;
        return this.getCurrentCar();
    }
}
