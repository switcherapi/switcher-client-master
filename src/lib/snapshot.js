const fs = require('fs');
const IPCIDR = require('ip-cidr');
const DateMoment = require('./datemoment');
const { resolveSnapshot, checkSnapshotVersion } = require('./services');

const loadDomain = (snapshotLocation, environment, snapshotAutoload) => {
    try {
        let dataBuffer;
        const snapshotFile = `${snapshotLocation}${environment}.json`;
        if (fs.existsSync(snapshotFile)) {
            dataBuffer = fs.readFileSync(snapshotFile);
        } else if (snapshotAutoload) {
            dataBuffer = JSON.stringify({ data: { domain: { version: 0 } } }, null, 4);
            fs.mkdir(snapshotLocation, { recursive: true }, () => {});
            fs.writeFileSync(snapshotFile, dataBuffer);
        } else {
            throw new Error();
        }

        const dataJSON = dataBuffer.toString();
        return JSON.parse(dataJSON);
    } catch (e) {
        throw new Error(`Something went wrong: It was not possible to load the file at ${snapshotLocation}`);
    }
};

const validateSnapshot = async (url, token, domain, environment, component, snapshotLocation, snapshotVersion) => {
    const { status } = await checkSnapshotVersion(url, token, snapshotVersion);

    if (!status) {
        const snapshot = await resolveSnapshot(url, token, domain, environment, component);
        
        fs.writeFileSync(`${snapshotLocation}${environment}.json`, snapshot);
        return true;
    }
    return false;
};

const StrategiesType = Object.freeze({
    NETWORK: 'NETWORK_VALIDATION',
    VALUE: 'VALUE_VALIDATION',
    NUMERIC: 'NUMERIC_VALIDATION',
    TIME: 'TIME_VALIDATION',
    DATE: 'DATE_VALIDATION',
    REGEX: 'REGEX_VALIDATION'
});

const OperationsType = Object.freeze({
    EQUAL: 'EQUAL',
    NOT_EQUAL: 'NOT_EQUAL',
    EXIST: 'EXIST',
    NOT_EXIST: 'NOT_EXIST',
    GREATER: 'GREATER',
    LOWER: 'LOWER',
    BETWEEN: 'BETWEEN'
});

const processOperation = (strategy, operation, input, values) => {
    switch(strategy) {
        case StrategiesType.NETWORK:
            return processNETWORK(operation, input, values);
        case StrategiesType.VALUE:
            return processVALUE(operation, input, values);
        case StrategiesType.NUMERIC:
            return processNUMERIC(operation, input, values);
        case StrategiesType.TIME:
            return processTime(operation, input, values);
        case StrategiesType.DATE:
            return processDate(operation, input, values);
        case StrategiesType.REGEX:
            return processREGEX(operation, input, values);
    }
};

function processNETWORK(operation, input, values) {

    const cidrRegex = /^([0-9]{1,3}\.){3}[0-9]{1,3}(\/([0-9]|[1-2][0-9]|3[0-2]))$/;
    
    switch(operation) {
        case OperationsType.EXIST:
            for (var i = 0; i < values.length; i++) {
                if (values[i].match(cidrRegex)) {
                    const cidr = new IPCIDR(values[i]);
                    if (cidr.contains(input)) {
                        return true;
                    }
                } else {
                    return values.includes(input);
                }
            }
            break;
        case OperationsType.NOT_EXIST: {
            const result = values.filter(element => {
                if (element.match(cidrRegex)) {
                    const cidr = new IPCIDR(element);
                    if (cidr.contains(input)) {
                        return true;
                    }
                } else {
                    return values.includes(input);
                }
            });
            return result.length === 0;
        }
    }

    return false;
}

function processVALUE(operation, input, values) {
    switch(operation) {
        case OperationsType.EXIST:
            return values.includes(input);
        case OperationsType.NOT_EXIST:
            return !values.includes(input);
        case OperationsType.EQUAL:
            return input === values[0];
        case OperationsType.NOT_EQUAL: {
            const result = values.filter(element => element === input);
            return result.length === 0;
        }
    }
}

function processNUMERIC(operation, input, values) {
    switch(operation) {
        case OperationsType.EXIST:
            return values.includes(input);
        case OperationsType.NOT_EXIST:
            return !values.includes(input);
        case OperationsType.EQUAL:
            return input === values[0];
        case OperationsType.NOT_EQUAL:
            return values.filter(element => element === input).length === 0;
        case OperationsType.LOWER:
            return input < values[0];
        case OperationsType.GREATER:
            return input > values[0];
        case OperationsType.BETWEEN:
            return input >= values[0] && input <= values[1];
    }
}

function processTime(operation, input, values) {
    const dateMoment = new DateMoment(new Date(), input);

    switch(operation) {
        case OperationsType.LOWER:
            return dateMoment.isSameOrBefore(dateMoment.getDate(), values[0]);
        case OperationsType.GREATER:
            return dateMoment.isSameOrAfter(dateMoment.getDate(), values[0]);
        case OperationsType.BETWEEN:
            return dateMoment.isBetween(dateMoment.getDate(), dateMoment.getDate(), values[0], values[1]);
    }
}

function processDate(operation, input, values) {
    const dateMoment = new DateMoment(input);

    switch(operation) {
        case OperationsType.LOWER:
            return dateMoment.isSameOrBefore(values[0]);
        case OperationsType.GREATER:
            return dateMoment.isSameOrAfter(values[0]);
        case OperationsType.BETWEEN:
            return dateMoment.isBetween(values[0], values[1]);
    }
}

function processREGEX(operation, input, values) {
    switch(operation) {
        case OperationsType.EXIST:
            for (var i = 0; i < values.length; i++) {
                if (input.match(values[i])) {
                    return true;
                }
            }
            return false;
        case OperationsType.NOT_EXIST:
            return !processREGEX(OperationsType.EXIST, input, values);
        case OperationsType.EQUAL:
            return input.match(`\\b${values[0]}\\b`) != null;
        case OperationsType.NOT_EQUAL:
            return !processREGEX(OperationsType.EQUAL, input, values);
    }
}

module.exports = {
    loadDomain,
    validateSnapshot,
    processOperation,
    StrategiesType,
    OperationsType
};