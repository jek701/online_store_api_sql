const crypto = require('crypto');

function generateJwtSecret(length = 64) {
    return crypto.randomBytes(length).toString('hex');
}

const secret = generateJwtSecret();
console.log(secret);
