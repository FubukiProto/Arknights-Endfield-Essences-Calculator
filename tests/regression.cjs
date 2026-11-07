const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadCalculator() {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const appScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
    const context = vm.createContext({ window: { location: { search: '?lang=zh-CN' } }, URLSearchParams,
        document: { addEventListener() {} } });
    vm.runInContext(appScript + '\ndisplayResults = () => {};', context);
    return {
        run(code) {
            return JSON.parse(vm.runInContext(`JSON.stringify(${code})`, context));
        },
        calculate(ids, mainId = null) {
            context.inputIds = ids;
            context.inputMainId = mainId;
            vm.runInContext('selectedWeaponIds = inputIds; mainWeaponId = inputMainId; calculateOptimalCombinations();', context);
            return this.run('calculationResults');
        }
    };
}

const newWeaponIds = [66, 67, 68, 69];

test('weapon IDs are stable and all four Danqingdu weapons can be farmed individually', () => {
    const app = loadCalculator();
    assert.deepEqual(app.run('weapons.map(w => w.id).sort((a, b) => a - b)'), Array.from({ length: 69 }, (_, i) => i + 1));
    for (const id of newWeaponIds) {
        const results = app.calculate([id], id);
        assert.ok(results.length > 0);
        assert.ok(results.every(r => r.matchedWeapons.some(w => w.id === id)));
    }
});

test("Si's Painting covers both cryo greatswords, but not Complexed Industry", () => {
    const app = loadCalculator();
    assert.deepEqual(app.run('nodes.map(node => node.id)'), Array.from({ length: 13 }, (_, i) => i + 1));
    assert.equal(app.run('i18n["zh-TW"]["祀的画"]'), '祀的畫');
    app.run('nodes.splice(0, 12)');

    const results = app.calculate([66, 68]);
    assert.ok(results.length > 0);
    assert.ok(results.every(r => r.nodeName === '祀的画' && r.selectedFarmableCount === 2));
    assert.ok(app.calculate([67]).length > 0);
    assert.deepEqual(app.calculate([69]), []);
});

test('main weapon coverage is ranked before the ten-result limit', () => {
    const app = loadCalculator();
    for (const id of newWeaponIds) {
        const results = app.calculate(newWeaponIds, id);
        assert.ok(results[0].matchedWeapons.some(w => w.id === id));
        const firstWithoutMain = results.findIndex(r => !r.coversMainWeapon);
        if (firstWithoutMain >= 0) assert.ok(results.slice(firstWithoutMain).every(r => !r.coversMainWeapon));
    }
});

test('base attributes maximize coverage using the recommendation ranking', () => {
    const app = loadCalculator();
    app.run('nodes.splice(0, nodes.length, nodes.find(node => node.id === 7))');
    const result = app.calculate([...newWeaponIds, 2, 4]).find(r => r.combination.selectedAttribute === '附术');
    assert.equal(result.selectedFarmableCount, 2);
    assert.equal(result.totalFarmableCount, 7);
    assert.deepEqual(result.combination.selectedBaseAttributes, ['敏捷提升', '意志提升', '智识提升']);
});
