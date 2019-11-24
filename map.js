let make = function(e, c, p) { let d = document.createElement(e); d.className = c; if (p) p.appendChild(d); return d; }

let domLoaded = false;
let DATA = null;

let controls = null;
let details = null;

/*
    data.json contains:
        'pools' => array of [poolId,poolData]
        'dens'  => array of denData
    
    denData:
      - id [string]
      - name [string]
      - zoneName [string]
      - thumbImage [url]
      - fullImage [url]
      - commonPool [integer]
      - rarePool [integer]
      - leftX [fraction]
      - bottomY [fraction]
      
    poolData:
      array of ([spawnData] OR [swordSpawnData, shieldSpawnData])
      
    spawnData:
      - id [integer]
      - poolId [integer]
      - versionMask [bitmask (0x1 sword, 0x2 shield)]
      - stars [bitmask, 1 << (stars-1)]
      - species [text]
      - lvlMin [integer]
      - lvlMax [integer]
      - gender [bitmask (0x1 female, 0x2 random, 0x4 male)]
      - isGMax [boolean]
      - isHA [boolean]
      - chanceDrops [array of [item, %chance]]
      - bonusDrops [array of [item, count]]
*/

let renderDens = [];

/* match criteria bitmask */
const MASK_CRIT_SPECIES = 0x01;
const MASK_CRIT_STARS = 0x02;
const MASK_CRIT_VERSION = 0x04;
const MASK_CRIT_GMAX = 0x08;
const MASK_CRIT_ABILITY = 0x10;
const MASK_CRIT_GENDER = 0x20;
const MASK_CRIT_ITEMS = 0x40;
const MASK_CRIT_ALL = (MASK_CRIT_SPECIES | MASK_CRIT_STARS | MASK_CRIT_VERSION | MASK_CRIT_GMAX | MASK_CRIT_ABILITY | MASK_CRIT_GENDER | MASK_CRIT_ITEMS);

/* star rating filter bitmask */
//const MASK_1STAR = 0x01;
const MASK_2STAR = 0x02;
const MASK_3STAR = 0x04;
const MASK_4STAR = 0x08;
const MASK_5STAR = 0x10;
const MASK_ALL_STAR = (/*MASK_1STAR | */MASK_2STAR | MASK_3STAR | MASK_4STAR | MASK_5STAR);

/* gender filter bitmask */
const MASK_GENDER_FEMALE = 0x01;
const MASK_GENDER_RANDOM = 0x02;
const MASK_GENDER_MALE = 0x04;
const MASK_ALL_GENDER = (MASK_GENDER_FEMALE | MASK_GENDER_RANDOM | MASK_GENDER_MALE);

/* controls list */
const STAR_CONTROLS = [/*['star-1',MASK_1STAR],*/['star-2',MASK_2STAR],['star-3',MASK_3STAR],['star-4',MASK_4STAR],['star-5',MASK_5STAR]];
const VERSION_CONTROLS = [['ver-sword',false],['ver-shield',true]];
const GMAX_CONTROLS = [['gmax-no',false],['gmax-yes',true]];
const ABILITY_CONTROLS = [['ability-any',false],['ability-hidden',true]];
const GENDER_CONTROLS = [['gender-f',MASK_GENDER_FEMALE],['gender-r',MASK_GENDER_RANDOM],['gender-m',MASK_GENDER_MALE]];

const emptyFilter = {
    species: null,
    stars: 0,
    version: null, /* null <-> both, true <-> shield, false <-> sword */
    gigantamax: null, /* null <-> both, true <-> only gmax, false <-> no gmax */
    ability: null, /* null <-> both, true <-> only HA, false <-> no HA */
    gender: 0,
    item: null
};
const SameFilter = ((a,b) => !((a.species !== b.species) ||
        (a.stars !== b.stars) ||
        (a.version !== b.version) ||
        (a.gigantamax !== b.gigantamax) ||
        (a.ability !== b.ability) ||
        (a.gender !== b.gender) ||
        (a.item !== b.item)));
let activeFilter = Object.assign({},emptyFilter);

let MatchSpawnData = function(filter, spawnData)
{
    let matchMask = 0x0;
    if ((filter.species === null) || (filter.species === spawnData.species))
        matchMask |= MASK_CRIT_SPECIES;
    if (!filter.stars || (filter.stars & spawnData.stars))
        matchMask |= MASK_CRIT_STARS;
    if ((filter.version === null) || ((1 << filter.version) & spawnData.versionMask))
        matchMask |= MASK_CRIT_VERSION;
    if ((filter.gigantamax === null) || (filter.gigantamax === spawnData.isGMax))
        matchMask |= MASK_CRIT_GMAX;
    if ((filter.ability === null) || (filter.ability === spawnData.isHA))
        matchMask |= MASK_CRIT_ABILITY;
    if (!filter.gender || (filter.gender & spawnData.gender))
        matchMask |= MASK_CRIT_GENDER;
    {
        let ok = (filter.item === null);
        if (!ok) for (const [item,chance] of spawnData.chanceDrops)
        {
            if (filter.item === item)
            {
                ok = true;
                break;
            }
        }
        if (!ok) for (const [item,count]  of spawnData.bonusDrops)
        {
            if (filter.item === item)
            {
                ok = true;
                break;
            }
        }
        if (ok)
            matchMask |= MASK_CRIT_ITEMS;
    }
    return matchMask;
};

let selectedDen = null;
let selectedSpawn = null;
let SetSelectedDen = function(den)
{
    if (selectedDen !== null)
        selectedDen.classList.remove('selected');
    selectedDen = den;
    if (selectedDen === null)
    {
        details.classList.remove('visible');
        return;
    }
    selectedDen.classList.add('selected');
    details.classList.add('visible');
    
    const denData = selectedDen.denData;
    document.getElementById('details-thumbnail').src = ('th/'+denData.id+'.jpg');
    document.getElementById('details-title').innerText = denData.name;
    let commonTitle = document.getElementById('details-common-title');
    let rareTitle = document.getElementById('details-rare-title');
    commonTitle.innerText = ('Red Beam - Pool #' + denData.commonPool);
    commonTitle.href = ('https://www.serebii.net/swordshield/maxraidbattles/den'+denData.commonPool+'.shtml');
    rareTitle.innerText = ('Purple Beam - Pool #' + denData.rarePool);
    rareTitle.href = ('https://www.serebii.net/swordshield/maxraidbattles/den'+denData.rarePool+'.shtml');
    
    for (const type of ['common','rare'])
    {
        const poolId = denData[type+'Pool'];
        const poolData = DATA.pools.find(pool => (pool[0] === poolId))[1];
        for (let i=0; i<12; ++i)
        {
            const spawnDatas = poolData[i];
            const box = document.getElementById('details-button-'+type+'-'+i);
            box.href = ('https://www.serebii.net/swordshield/maxraidbattles/den'+poolId+'.shtml');
            if ((spawnDatas.length === 1) || (activeFilter.version !== null))
            {
                const spawnData = spawnDatas[((spawnDatas.length === 2) && activeFilter.version)?1:0];
                const match = (MatchSpawnData(activeFilter, spawnData) === MASK_CRIT_ALL);
                
                box.classList.add('both');
                box.classList.toggle('disabled',!match);
                box.classList.remove('sword-only','shield-only');
                box.species1.removeAttribute('src');
                box.species1.src = ('sprite/'+(spawnData.isGMax ? 'gmax_' : '')+spawnData.species+'.png');
                for (const [c,m] of STAR_CONTROLS)
                    box.classList.toggle(c,spawnData.stars === m);
            }
            else
            {
                const [swordSpawnData, shieldSpawnData] = spawnDatas;
                const matchSword = (MatchSpawnData(activeFilter, swordSpawnData) === MASK_CRIT_ALL);
                const matchShield = (MatchSpawnData(activeFilter, shieldSpawnData) === MASK_CRIT_ALL);
                if ((swordSpawnData.species === shieldSpawnData.species) && (swordSpawnData.isGMax === shieldSpawnData.isGMax) && (matchSword === matchShield))
                {
                    box.classList.add('both');
                    box.classList.toggle('disabled',!matchSword);
                    box.classList.remove('sword-only','shield-only');
                    box.species1.removeAttribute('src');
                    box.species1.src = ('sprite/'+(swordSpawnData.isGMax ? 'gmax_' : '')+swordSpawnData.species+'.png');
                    box.species1.title = swordSpawnData.species;
                }
                else if (matchSword !== matchShield)
                {
                    const data = (matchSword ? swordSpawnData : shieldSpawnData);
                    box.classList.toggle('sword-only', matchSword);
                    box.classList.toggle('shield-only', matchShield);
                    box.classList.remove('both','disabled');
                    
                    const btn = (matchSword ? box.species1 : box.species2);
                    btn.removeAttribute('src');
                    btn.src = ('sprite/'+(data.isGMax ? 'gmax_' : '')+data.species+'.png');
                    btn.title = ('Pokémon '+(matchSword?'Sword':'Shield')+' only: '+data.species);
                }
                else
                {
                    box.classList.toggle('disabled',!matchSword);
                    box.classList.remove('both','sword-only','shield-only');
                    box.species1.removeAttribute('src');
                    box.species1.src = ('sprite/'+(swordSpawnData.isGMax ? 'gmax_' : '')+swordSpawnData.species+'.png');
                    box.species1.title = ('Pokémon Sword only: '+swordSpawnData.species);
                    box.species2.removeAttribute('src');
                    box.species2.src = ('sprite/'+(shieldSpawnData.isGMax ? 'gmax_' : '')+shieldSpawnData.species+'.png');
                    box.species2.title = ('Pokémon Shield only: '+shieldSpawnData.species);
                }
                
                const star = ((swordSpawnData.stars === shieldSpawnData.stars) ? swordSpawnData.stars : 0);
                for (const [c,m] of STAR_CONTROLS)
                    box.classList.toggle(c,star === m);
            }
        }
    }
};
let SetSelectedSpawn = function(spawn)
{
    selectedSpawn = spawn;
    if (selectedSpawn === null)
    {
        details.classList.remove('spawn');
        return;
    }
    details.classList.add('spawn');
};

let matchedPools = null;
let FiltersChanged = function()
{
    // preprocessing
    if (activeFilter.stars === MASK_ALL_STAR)
        activeFilter.stars = 0;
    if (activeFilter.gender === MASK_ALL_GENDER)
        activeFilter.gender = 0;
    
    // matching
    matchedPools = new Set();
    let availableSpecies = new Set();
    let availableStars = 0x0;
    let availableVersion = 0x0;
    let availableGMax = 0x0;
    let availableAbility = 0x0;
    let availableGender = 0x0;
    let availableItems = new Set();
    for (const [poolId,poolData] of DATA.pools)
    {
        for (spawnDatas of poolData)
        {
            for (let isShield=0; isShield<spawnDatas.length; ++isShield)
            {
                const spawnData = spawnDatas[isShield];
                const matchMask = MatchSpawnData(activeFilter, spawnData);
                
                if ((matchMask | MASK_CRIT_SPECIES) === MASK_CRIT_ALL)
                    availableSpecies.add(spawnData.species);
                if ((matchMask | MASK_CRIT_STARS) === MASK_CRIT_ALL)
                    availableStars |= spawnData.stars;
                if ((matchMask | MASK_CRIT_VERSION) === MASK_CRIT_ALL)
                    availableVersion |= spawnData.versionMask;
                if ((matchMask | MASK_CRIT_GMAX) === MASK_CRIT_ALL)
                    availableGMax |= (0x1 << spawnData.isGMax);
                if ((matchMask | MASK_CRIT_ABILITY) === MASK_CRIT_ALL)
                    availableAbility |= (0x1 << spawnData.isHA);
                if ((matchMask | MASK_CRIT_GENDER) === MASK_CRIT_ALL)
                    availableGender |= spawnData.gender;
                if ((matchMask | MASK_CRIT_ITEMS) === MASK_CRIT_ALL)
                {
                    for (const [item,chance] of spawnData.chanceDrops)
                        availableItems.add(item);
                    for (const [item,count]  of spawnData.bonusDrops)
                        availableItems.add(item);
                }
                
                if (matchMask === MASK_CRIT_ALL)
                    matchedPools.add(poolId);
            }
        }
    }
    
    // rendering
    {
        let select = document.getElementById('species');
        while (select.lastChild)
            select.removeChild(select.lastChild);
        make('option','',select).innerText = '<no filter>';
        
        for (const species of Array.from(availableSpecies).sort())
            make('option','',select).innerText = species;
        
        if (activeFilter.species !== null)
            select.value = activeFilter.species;
    }
    
    for (const [id,mask] of STAR_CONTROLS)
    {
        let btn = document.getElementById(id);
        btn.classList.toggle('disabled',!(availableStars & mask));
        btn.classList.toggle('selected',(!activeFilter.stars || (activeFilter.stars & mask)));
    }
    for (const [version,state] of VERSION_CONTROLS)
    {
        let btn = document.getElementById(version);
        btn.classList.toggle('disabled',!(availableVersion & (1 << state)));
        btn.classList.toggle('selected',((activeFilter.version === null) || (activeFilter.version === state)));
    }
    for (const [id,state] of GMAX_CONTROLS)
    {
        let btn = document.getElementById(id);
        btn.classList.toggle('disabled',!(availableGMax & (1 << state)));
        btn.classList.toggle('selected',((activeFilter.gigantamax === null) || (activeFilter.gigantamax === state)));
    }
    for (const [id,state] of ABILITY_CONTROLS)
    {
        let btn = document.getElementById(id);
        btn.classList.toggle('disabled',!(availableAbility & (1 << state)));
        btn.classList.toggle('selected',((activeFilter.ability === null) || (activeFilter.ability === state)));
    }
    for (const [id,mask] of GENDER_CONTROLS)
    {
        let btn = document.getElementById(id);
        btn.classList.toggle('disabled',!(availableGender & mask));
        btn.classList.toggle('selected',(!activeFilter.gender || (activeFilter.gender & mask)));
    }
    {
        let select = document.getElementById('item');
        while (select.lastChild)
            select.removeChild(select.lastChild);
        make('option','',select).innerText = '<no filter>';
        
        for (const item of Array.from(availableItems).sort())
            make('option','',select).innerText = item;
        
        if (activeFilter.item !== null)
            select.value = activeFilter.item;
    }

    // toggle den classes
    const isEmpty = SameFilter(emptyFilter,activeFilter);
    if (!isEmpty && (selectedDen !== null) && !(matchedPools.has(selectedDen.denData.commonPool) || matchedPools.has(selectedDen.denData.rarePool)))
        SetSelectedDen(null);
    else
        SetSelectedDen(selectedDen);
    
    for (let denDiv of renderDens)
    {
        const denData = denDiv.denData;
        const hasCommon = matchedPools.has(denData.commonPool);
        const hasRare = matchedPools.has(denData.rarePool);
        denDiv.classList.toggle('all',isEmpty && (hasCommon || hasRare));
        denDiv.classList.toggle('common',!isEmpty && hasCommon);
        denDiv.classList.toggle('rare',!isEmpty && hasRare);
    }
    
    document.getElementById('controls-reset').classList.toggle('enabled', !isEmpty);
};

let DenClicked = function(e)
{
    if (e.button != 0) return;
    if (!this.classList.contains('common') &&
        !this.classList.contains('rare') &&
        !this.classList.contains('all')) return;

    if (this.classList.contains('selected'))
        SetSelectedDen(null);
    else
        SetSelectedDen(this);
};
let SpawnClicked = function(e)
{
    if (e.button != 0) return;
    if (!this.classList.contains('available')) return;
    SetSelectedSpawn(this);
};

let Load = function()
{
    /* map setup - spawn dens */
    let map = document.getElementById('map');
    for (const denData of DATA.dens)
    {
        if ((denData.leftX === null) || (denData.bottomY === null))
            continue;

        let element = make('div','den',map);
        element.style.left = (denData.leftX+'%');
        element.style.bottom = (denData.bottomY+'%');
        for (let i=0; i<4; ++i)
            make('div','den-circle'+i,element);
        element.denData = denData;
        element.addEventListener('click', DenClicked);
        
        renderDens.push(element);
    }
    /* map setup done */
    
    /* details setup - create grid elements, hook them up to handlers etc. */
    document.getElementById('details-thumbnail').addEventListener('click', () =>
    {
        document.getElementById('image-overlay').classList.add('visible');
        document.getElementById('overlay-image').src = ('img/'+selectedDen.denData.id+'.jpg');
    });
    document.getElementById('image-overlay').addEventListener('click', function(e)
    {
        if (e.button) return;
        this.classList.remove('visible');
    });
    for (const type of ['common','rare'])
    {
        const reference = document.getElementById('details-'+type+'-title');
        const parent = reference.parentElement;
        const next = reference.nextElementSibling;
        for (const rowIndex of [0,1,2])
        {
            let row = document.createElement('div');
            row.className = 'details-row';
            parent.insertBefore(row, next);
            
            for (const colIndex of [0,1,2,3])
            {
                const index = (rowIndex*4)+colIndex;
                let button = make('a','details-button',row);
                button.id = ('details-button-'+type+'-'+index);
                button.target = '_blank';
                
                const s1container = make('div','details-species1',button);
                make('img','details-species-bg',s1container).src = 'icon/ver_sword.png';
                button.species1 = make('img','',s1container);
                
                const s2container = make('div','details-species2',button);
                make('img','details-species-bg',s2container).src = 'icon/ver_shield.png';
                button.species2 = make('img','',s2container);
                
                for (let i=1; i<=5; ++i)
                    make('img','details-star details-star'+i,button).src = ('icon/star_'+i+'.png');
                
                //button.addEventListener('click',SpawnClicked);
            }
        }
    }
    /* details setup done */
    
    /* controls setup - hook up all the buttons and shit */
    document.getElementById('species').addEventListener('change', function()
    {
        const v = this.value;
        if (v === '<no filter>')
            activeFilter.species = null;
        else
            activeFilter.species = v;
        FiltersChanged();
    });
    
    for (const [id,mask] of STAR_CONTROLS)
    {
        let btn = document.getElementById(id);
        btn.addEventListener('click', () =>
        {
            activeFilter.stars ^= mask;
            FiltersChanged();
        });
    }
    for (const [version,state] of VERSION_CONTROLS)
    {
        let btn = document.getElementById(version);
        btn.addEventListener('click', () =>
        {
            if (activeFilter.version !== state)
                activeFilter.version = state;
            else
                activeFilter.version = null;
            FiltersChanged();
        });
    }
    for (const [id,state] of GMAX_CONTROLS)
    {
        let btn = document.getElementById(id);
        btn.addEventListener('click', () =>
        {
            if (activeFilter.gigantamax !== state)
                activeFilter.gigantamax = state;
            else
                activeFilter.gigantamax = null;
            FiltersChanged();
        });
    }
    for (const [id,state] of ABILITY_CONTROLS)
    {
        let btn = document.getElementById(id);
        btn.addEventListener('click', () =>
        {
            if (activeFilter.ability !== state)
                activeFilter.ability = state;
            else
                activeFilter.ability = null;
            FiltersChanged();
        });
    }
    for (const [id,mask] of GENDER_CONTROLS)
    {
        let btn = document.getElementById(id);
        btn.addEventListener('click', () =>
        {
            activeFilter.gender ^= mask;
            FiltersChanged();
        });
    }
    
    document.getElementById('item').addEventListener('change', function()
    {
        const v = this.value;
        if (v === '<no filter>')
            activeFilter.item = null;
        else
            activeFilter.item = v;
        FiltersChanged();
    });
    
    document.getElementById('controls-reset').addEventListener('click',function()
    {
        if (!this.classList.contains('enabled')) return;
        activeFilter = null; // will make FiltersChanged reassign
        activeFilter = Object.assign({},emptyFilter);
        FiltersChanged();
    });
    /* controls setup done */
    
    // now render everything properly
    FiltersChanged();
};

fetch('data.json').then((d) => d.json()).then((d) => { DATA = d; if (domLoaded) Load(); });
document.addEventListener("DOMContentLoaded",() =>
{
    controls = document.getElementById('controls');
    details = document.getElementById('details');
    document.getElementById('controls-open').addEventListener('click', () =>
    {
        controls.classList.add('visible');
    });
    document.getElementById('controls-close').addEventListener('click', () =>
    {
        controls.classList.remove('visible');
    });
    document.getElementById('controls-apply').addEventListener('click', () =>
    {
        controls.classList.remove('visible');
    });
    document.getElementById('details-close').addEventListener('click', () =>
    {
        SetSelectedDen(null);
    });
    
    domLoaded = true;
    if (DATA !== null)
        Load();
    
    /*{
        let map = document.getElementById('map');
        map.addEventListener('click', (event) =>
        {
          let r = map.getBoundingClientRect();
          console.log((event.clientX - r.x)*100/r.width, (r.bottom - (event.clientY))*100/r.height);
        });
    }*/
});