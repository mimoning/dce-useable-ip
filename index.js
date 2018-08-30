const fs = require('fs');
const path = require('path');
const axios = require('axios');
const colors = require('colors');

function readFile(path, options) {
    return new Promise((resolve, reject) => {
        fs.readFile(path, options, (err, data) => {
            if (err) reject(err);
            if (!data) console.log('空文件');
            resolve(data.trim());
        });
    });
}

function getIpLastNumber(ip) {
    const index = ip.lastIndexOf('.');
    return parseInt(ip.slice(index + 1));
}

function dealWithIpGroup(group) {
    const [start, end] = group.replace(/\s/g, '').split('~');

    if(!end) return [start];

    const startNumber = getIpLastNumber(start);
    const endNumber = getIpLastNumber(end);
    
    const ipGroup = [];
    const baseIp = start.slice(0, start.lastIndexOf('.') + 1);

    for (let i = 0; i < endNumber - startNumber; i++) {
        ipGroup.push(`${baseIp}${startNumber + i}`);
    }
    return ipGroup;
}

function splitIps(data) {
    const arr = data.split(/\n|\r/);
    const ips = arr.reduce((prev, curr) => [...prev, ...dealWithIpGroup(curr)], []);

    return ips;
}

function checkIp(ip) {
    // return `http://${ip}/dce/license/check`;
    return axios.get(`http://${ip}/dce/healthz`, { timeout: 2000 })
        .then(res => ({ data: res.data, ip }))
        .catch(() => ({ data: null, ip }));
}

function getVersions({ data, ip }) {
    // return axios.get(`http://admin:changeme@${ip}/dce/system/dce-versions`, { timeout: 2000 })
    return axios.get(`http://${ip}/dce/version`, { timeout: 2000 })
        .then(res => {
            return { data, ip, version: res.data.DCEVersion };
        })
        .catch(() => ({ data, ip }));
}

async function getTheUsableIpsVersions(ips) {
    const ps = [];
    ips.forEach(ip => {
        ps.push(getVersions(ip))
    })
    const results = await Promise.all(ps);
    return results;
}

async function checkAllIps(ips) {
    const ps = [];
    ips.forEach(ip => {
        ps.push(checkIp(ip));
    });
    const results = await Promise.all(ps);
    usableResults = results.filter(({ data }) => !!data && typeof data === 'object');
    const res = await getTheUsableIpsVersions(usableResults);
    return res;
}

function checkIpHealthy(data) {
    if (typeof data !== 'object') return;
    const checkMap = {
        Kubernetes: 'Kubernetes',
        SwarmManager: '集群管理 API',
        Etcd: 'Etcd 存储',
    }

    const unhealthyItems = [];
    
    for (let [k, v] of Object.entries(data)) {
        if (v === 'Healthy') continue;
        unhealthyItems.push(checkMap[k]);
    }

    return unhealthyItems;
}

function showResults(results) {
    if (!results.length) return console.log('没有可用节点，可以安心的去喝杯茶划划水了！'.red);
    results.forEach(({ data, ip, version }) => {
        const unhealthyItems = checkIpHealthy(data);
        if (unhealthyItems.length) {
            console.log(`${ ip } 可用，但是 ${unhealthyItems.join('、')} 挂了`.yellow);
        } else {
            const versionInfo = version ? '，DCE 版本是 '.green + version.magenta : '';
            console.log(ip.blue + ' Totally 可用'.green + versionInfo);
        }
    })
    console.log('老老实实搬砖吧~'.cyan);
    console.log()
}

async function main() {
    try {
        const data = await readFile(`${__dirname}/ips`, { flag: 'r+', encoding: 'utf8' });
        const ips = splitIps(data);
        const usableResults = await checkAllIps(ips);
        showResults(usableResults);
    } catch (err) {
        console.error(err);
    }
}

main();