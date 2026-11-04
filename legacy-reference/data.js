// public/data.js
window.APP_DATA = {
    categories: [
        { id: 'batarei', name: 'Батареи салютов', icon: 'fa-fire', color: '#e74c3c', count: 45 },
        { id: 'dym', name: 'Цветной дым', icon: 'fa-smog', color: '#3498db', count: 18 },
        { id: 'feyerverki', name: 'Фейерверки', icon: 'fa-rocket', color: '#9b59b6', count: 32 },
        { id: 'fontany', name: 'Фонтаны', icon: 'fa-birthday-cake', color: '#2ecc71', count: 25 },
        { id: 'rakety', name: 'Ракеты', icon: 'fa-shuttle-space', color: '#e67e22', count: 15 },
        { id: 'petardy', name: 'Петарды', icon: 'fa-bomb', color: '#34495e', count: 20 },
        { id: 'svechi', name: 'Римские свечи', icon: 'fa-star', color: '#f39c12', count: 12 },
        { id: 'hlopushki', name: 'Хлопушки', icon: 'fa-gift', color: '#1abc9c', count: 10 }
    ],
    baseProducts: {
        batarei: [
            { id: 1, name: 'Салют «Красная площадь»', category: 'batarei', brand: 'Русский фейерверк', type: 'Батарея салютов', price: 2490, oldPrice: 3200, description: '100 залпов, калибр 1.2", длительность 45 секунд.', rating: 4.8, reviews: 128, stores: ['ул. Ленина, 45', 'ТРК «Родник»', 'пр. Комсомольский, 112'] },
            { id: 2, name: 'Батарея «Гранд Финал»', category: 'batarei', brand: 'SuperFire', type: 'Батарея салютов', price: 3890, description: '36 залпов, эффект "золотая ива".', rating: 5, reviews: 86, stores: ['ул. Ленина, 45', 'ТРК «Родник»'] },
            { id: 3, name: 'Батарея «Праздничная»', category: 'batarei', brand: 'ПироМир', type: 'Батарея салютов', price: 1990, description: '25 залпов, калибр 0.8".', rating: 4.5, reviews: 45, stores: ['ул. Ленина, 45', 'пр. Комсомольский, 112'] },
            { id: 4, name: 'Салют «Новогодний»', category: 'batarei', brand: 'Русский фейерверк', type: 'Батарея салютов', price: 4500, description: '150 залпов, калибр 1.5".', rating: 4.9, reviews: 156, stores: ['ТРК «Родник»', 'пр. Комсомольский, 112'] }
        ],
        dym: [
            { id: 11, name: 'Дым «Синий туман»', category: 'dym', brand: 'SmokePro', type: 'Цветной дым', price: 300, description: 'Густой цветной дым.', rating: 4.5, reviews: 56, stores: ['ул. Ленина, 45', 'ТРК «Родник»'] },
            { id: 12, name: 'Дым «Красный»', category: 'dym', brand: 'SmokePro', type: 'Цветной дым', price: 300, description: 'Насыщенный красный дым.', rating: 4.3, reviews: 34, stores: ['ул. Ленина, 45'] }
        ],
        feyerverki: [
            { id: 21, name: 'Фейерверк «Звездопад»', category: 'feyerverki', brand: 'SkyShow', type: 'Высотный', price: 1500, description: 'До 50 метров.', rating: 5, reviews: 78, stores: ['ул. Ленина, 45', 'ТРК «Родник»'] },
            { id: 22, name: 'Фейерверк «Комета»', category: 'feyerverki', brand: 'SkyShow', type: 'Высотный', price: 2200, description: 'С эффектом кометы.', rating: 4.6, reviews: 52, stores: ['ул. Ленина, 45'] }
        ],
        fontany: [
            { id: 31, name: 'Фонтан «Золотой дождь»', category: 'fontany', brand: 'ПироМир', type: 'Фонтан', price: 890, description: 'Высота 2 метра.', rating: 4.7, reviews: 92, stores: ['ул. Ленина, 45', 'ТРК «Родник»', 'пр. Комсомольский, 112'] },
            { id: 32, name: 'Фонтан «Серебряный»', category: 'fontany', brand: 'ПироМир', type: 'Фонтан', price: 750, description: 'Серебристые искры.', rating: 4.4, reviews: 41, stores: ['ТРК «Родник»'] }
        ],
        rakety: [
            { id: 41, name: 'Ракета «Космос»', category: 'rakety', brand: 'SkyShow', type: 'Ракета', price: 1200, description: 'Высота 50 метров.', rating: 4.3, reviews: 45, stores: ['ул. Ленина, 45', 'пр. Комсомольский, 112'] }
        ],
        petardy: [
            { id: 51, name: 'Петарды «Корсар»', category: 'petardy', brand: 'ПироМир', type: 'Петарды', price: 350, description: '100 штук в упаковке.', rating: 4, reviews: 38, stores: ['ул. Ленина, 45', 'ТРК «Родник»'] }
        ],
        svechi: [
            { id: 61, name: 'Римские свечи (набор 10 шт)', category: 'svechi', brand: 'Русский фейерверк', type: 'Римские свечи', price: 1450, oldPrice: 1800, description: 'Калибр 0.8".', rating: 4.9, reviews: 64, stores: ['ул. Ленина, 45', 'ТРК «Родник»'] }
        ],
        hlopushki: [
            { id: 71, name: 'Хлопушка «Конфетти»', category: 'hlopushki', brand: 'ПироМир', type: 'Хлопушка', price: 150, description: 'С конфетти и серпантином.', rating: 4.2, reviews: 25, stores: ['ул. Ленина, 45', 'ТРК «Родник»', 'пр. Комсомольский, 112'] }
        ]
    }
};