import _ from 'lodash';

// for coding simplicity, using strings or numbers for all attributes
// booleans represented by 0 or 1
interface UserAttributes {
    city: string;
    country: string;
    language: string;
    hasEnterpriseBusinessDomain: number;
    isMobile: number;
    scrolledToBottom: number;
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
    deviceType: string;
    age: number;
    gender: string;
}

// need to track views by user, non-unique, with hourly granularity
// need to track demo bookings, only 1 per user


interface Events {
    [eventName: string]: {
        [datetimeHour: string]: {
            [userId: string]: number
        }
    }
}

interface UserToAttributes {
    [userId: string]: Partial<UserAttributes>;
}

const VIEW_EVENT = 'View page';
const BOOK_EVENT = 'Book demo';

const events: Events = {
    [VIEW_EVENT]: {
        "2024-09-08T18:00:00.000Z": {
            '123': 10,
            '456': 5
        },
        "2024-09-08T17:00:00.000Z": {
            '456': 5
        },
        "2024-09-08T16:00:00.000Z": {
            '789': 20
        }
    },
    [BOOK_EVENT]: {
        "2024-09-08T18:00:00.000Z": {
            '123': 1
        },
        "2024-09-08T17:00:00.000Z": {
            '456': 0
        },
        "2024-09-08T16:00:00.000Z": {
            '789': 1
        }
    }
};
const userToAttributes: UserToAttributes = {
    '123': {
        city: 'Chicago'
    },
    '456': {
        city: 'San Francisco'
    },
    '789': {
        city: 'San Francisco'
    }
};


// ########### Part 1: Track Users ###################


const trackView = (userId: string, userAttributes: UserAttributes): void => {
    const now = new Date();
    trackEvent(userId, VIEW_EVENT, now);
    trackUser(userId, userAttributes);
}

const trackBookDemo = (userId: string): void => {
    const now = new Date();
    trackEvent(userId, BOOK_EVENT, now);
}

const trackEvent = (userId: string, eventName: string, timestamp: Date): void => {
    const hourKey = getKeyFromDate(timestamp)
    const existingViews = events?.[eventName]?.[hourKey]?.[userId] || 0;

    events[eventName][hourKey][userId] = existingViews + 1;
} 

const getKeyFromDate = (date: Date): string => {
    const dateDupe = new Date(date.getTime());
    dateDupe.setMinutes(0,0,0);
    return dateDupe.toISOString();
}

const trackUser = (userId: string, attributes: UserAttributes): void => {
    userToAttributes[userId] = attributes;
}


// ############## Part 2: Last 24 Hrs #####################

// O(n) n: number of users
const getViewsLast24Hr = (): number => {
    
    return getEventSumLast24Hr(VIEW_EVENT);
}

// O(m) m: number of users who've booked
const getDemosLast24Hr = (): number => {
    return getEventSumLast24Hr(BOOK_EVENT);
} 

const getEventSumLast24Hr = (eventName: string): number => {
    const endHour = new Date();
    endHour.setHours(endHour.getHours() + 1);
    endHour.setMinutes(0,0,0);

    const startHour = new Date(endHour.getTime());
    startHour.setDate(startHour.getDate() - 1);

    return getEventSumForHours(eventName, startHour, endHour);
} 


const getEventSumForHoursFiltered = (eventName: string, startHour: Date, endHour: Date, userFilter?: (userId: string) => boolean) => {
    const eventsByHour = events[eventName];

    const timeBoundEntries = _.entries(eventsByHour).filter((entry) => {
        const hourKey = entry[0];
        const dateHour = new Date(hourKey);
        return dateHour >= startHour && dateHour <= endHour;
    })

    // todo could optimize by not doing the filtering pass if no filter fn present
    const counts = timeBoundEntries.flatMap(entry => _.entries(entry[1]).filter(userAndCount => {
        const userId = userAndCount[0];
        return userFilter ? userFilter(userId) : true;
    }).map(userAndCount => userAndCount[1]))

    return _.sum(counts)
}



const getEventSumForHours = (eventName: string, startHour: Date, endHour: Date): number => {
    return getEventSumForHoursFiltered(eventName, startHour, endHour);
}


// ############## Part 3: Moving averages and filters #####################

const movingAverageViewsFiltered = (duration: number, userFilter?: (userId: string) => boolean): {average: number, time: Date}[] => {
    return _.range(0, duration).map(hoursAgo => {
        const endHour = new Date();
        endHour.setHours(endHour.getHours() - hoursAgo);
        endHour.setMinutes(0,0,0);

        const startHour = new Date(endHour.getTime());
        startHour.setHours(startHour.getHours() - 6);
        return {average: getEventSumForHoursFiltered(VIEW_EVENT, startHour, endHour, userFilter) / 6, time: endHour};
    });
}

// todo make return type
// todo if 6 hours is past the 24 hour data boundary, average based on only what we have
const movingAverageViews = (duration: number): {average: number, time: Date}[] => {
    return movingAverageViewsFiltered(duration);
}

const movingAverageViewsByQuery = (duration: number, attribute: Partial<UserAttributes>): {average: number, time: Date}[] => {
    const userFilter = (userId: string) => {
        const user = userToAttributes[userId];
        console.log('user', user);
        return _.entries(attribute).every(filterAttribute => _.get(user, filterAttribute[0]) === filterAttribute[1]);
    }
    return movingAverageViewsFiltered(duration, userFilter);
}



// ############## Part 4: Predictor #####################

// naive implementation:
// for every user attribute and value combination
// get percentage of those users who book a demo


const getAllAttributeValueBookPredictions = () => {
    const attributeToValueToUserCount = getAttributeToValueToUserCount();

    return _.entries(attributeToValueToUserCount).map((entryAttributes) => {
        const attribute = entryAttributes[0];
        const valueToCount = entryAttributes[1];

        const valueToPercentTuples = _.entries(valueToCount).map((entryValue) => {
            const value = entryValue[0];
            const count = entryValue[1];

            const endHour = new Date();
            endHour.setHours(endHour.getHours() + 1);
            endHour.setMinutes(0,0,0);

            const startHour = new Date(endHour.getTime());
            startHour.setDate(startHour.getDate() - 1);

            const userFilter = (userId: string) => {
                return _.get(userToAttributes, [userId, attribute]) === value;
            }

            const totalBookingsWithAttributeValue = getEventSumForHoursFiltered(BOOK_EVENT, startHour, endHour, userFilter);

            return [value, totalBookingsWithAttributeValue / count];
        });

        return [attribute, valueToPercentTuples];

    })

}

const getAttributeToValueToUserCount = () => {
    const attributeToValueToUserCount: {[attribute: string]: {[value: string | number]: number}} = {};

    _.values(userToAttributes).forEach(userAttributes => {
        _.entries(userAttributes).forEach(userAttributeValuePair => {
            const attributeKey = userAttributeValuePair[0];
            const attributeValue = userAttributeValuePair[1];
            const existingCount = attributeToValueToUserCount?.[attributeKey]?.[attributeValue] || 0;

            attributeToValueToUserCount[attributeKey] = {...attributeToValueToUserCount[attributeKey], [attributeValue]: existingCount + 1};
        })
    });

    return attributeToValueToUserCount;
}

const getMostLikelyAttributeValue = () => {
    const allPredictions = getAllAttributeValueBookPredictions();

    let highestPredictionAttribute;
    let highestPredictionValue;
    let highestPredictionPercent = 0;

    allPredictions.forEach(prediction => {
        const attribute = prediction[0] as string;
        const valuePredictions= prediction[1] as (string | number)[][];

        valuePredictions.forEach(valuePrediction => {
            const value = valuePrediction[0];
            const predictionPercent = valuePrediction[1] as number;
            if (predictionPercent > highestPredictionPercent) {
                highestPredictionAttribute = attribute;
                highestPredictionValue = value;
                highestPredictionPercent = predictionPercent;
            }
        })
        

    });

    return {
        highestPredictionAttribute,
        highestPredictionValue,
        highestPredictionPercent
    }
}


// Bayes implementation:
// P(A|B) = P(B|A)*P(A)/P(B)
// A: Booking a demo
// B: an attribute value combo
// P(A|B): probability of booking given an attribute value combo
// P(B|A): probability of an attribute value combo given a booking
// P(A): overall probability of a user booking a demo
// P(B): overall probability of a user having a given attribute value

// todo: this calculation for every attribute value combo


console.log('last 24 hrs views', getViewsLast24Hr());

console.log('moving average 3 hours', movingAverageViews(3));

console.log('moving average 3 hours SF', movingAverageViewsByQuery(3, {city: 'San Francisco'}));

console.log('attribute value booking percentages', JSON.stringify(getAllAttributeValueBookPredictions()));
console.log(getMostLikelyAttributeValue());