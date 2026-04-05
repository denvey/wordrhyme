import type { GeoName } from '@wordrhyme/db';
import generatedCountries from './countries.generated.json' with { type: 'json' };

type CountrySeed = {
  code2: string;
  code3: string;
  numericCode: string;
  name: GeoName;
  officialName?: GeoName;
  flags?: {
    png: string;
    svg: string;
    alt?: string | null;
    emoji?: string | null;
  };
  currencyCode?: string;
  languageCode?: string;
  locale?: string;
  phoneCode?: string;
  isSupported?: boolean;
  sortOrder?: number;
};

type SubdivisionSeed = {
  countryCode2: string;
  code: string;
  fullCode: string;
  name: GeoName;
  type?: string;
  isSupported?: boolean;
  sortOrder?: number;
};

type GeneratedCountrySeed = {
  alpha2: string;
  alpha3: string;
  numericCode: string | null;
  commonEn: string;
  officialEn: string;
  commonZh: string;
  officialZh: string;
  flags: {
    png: string | null;
    svg: string | null;
    alt: string | null;
    emoji: string | null;
  };
  currencyCode: string | null;
  languageCode: string | null;
  locale: string | null;
  phoneCode: string | null;
};

export const GEO_COUNTRIES: CountrySeed[] = (generatedCountries as GeneratedCountrySeed[]).map(
  (country, index) => ({
    code2: country.alpha2,
    code3: country.alpha3,
    numericCode: country.numericCode ?? '',
    name: { 'en-US': country.commonEn, 'zh-CN': country.commonZh },
    officialName: { 'en-US': country.officialEn, 'zh-CN': country.officialZh },
    flags: {
      png: country.flags.png ?? '',
      svg: country.flags.svg ?? '',
      ...(country.flags.alt ? { alt: country.flags.alt } : {}),
      ...(country.flags.emoji ? { emoji: country.flags.emoji } : {}),
    },
    ...(country.currencyCode ? { currencyCode: country.currencyCode } : {}),
    ...(country.languageCode ? { languageCode: country.languageCode } : {}),
    ...(country.locale ? { locale: country.locale } : {}),
    ...(country.phoneCode ? { phoneCode: country.phoneCode } : {}),
    sortOrder: (index + 1) * 10,
  })
);

export const GEO_SUBDIVISIONS: SubdivisionSeed[] = [
  { countryCode2: 'CN', code: 'BJ', fullCode: 'CN-BJ', name: { 'en-US': 'Beijing', 'zh-CN': '北京' }, type: 'municipality', sortOrder: 10 },
  { countryCode2: 'CN', code: 'TJ', fullCode: 'CN-TJ', name: { 'en-US': 'Tianjin', 'zh-CN': '天津' }, type: 'municipality', sortOrder: 20 },
  { countryCode2: 'CN', code: 'HE', fullCode: 'CN-HE', name: { 'en-US': 'Hebei', 'zh-CN': '河北' }, type: 'province', sortOrder: 30 },
  { countryCode2: 'CN', code: 'SX', fullCode: 'CN-SX', name: { 'en-US': 'Shanxi', 'zh-CN': '山西' }, type: 'province', sortOrder: 40 },
  { countryCode2: 'CN', code: 'NM', fullCode: 'CN-NM', name: { 'en-US': 'Inner Mongolia', 'zh-CN': '内蒙古' }, type: 'autonomous-region', sortOrder: 50 },
  { countryCode2: 'CN', code: 'LN', fullCode: 'CN-LN', name: { 'en-US': 'Liaoning', 'zh-CN': '辽宁' }, type: 'province', sortOrder: 60 },
  { countryCode2: 'CN', code: 'JL', fullCode: 'CN-JL', name: { 'en-US': 'Jilin', 'zh-CN': '吉林' }, type: 'province', sortOrder: 70 },
  { countryCode2: 'CN', code: 'HL', fullCode: 'CN-HL', name: { 'en-US': 'Heilongjiang', 'zh-CN': '黑龙江' }, type: 'province', sortOrder: 80 },
  { countryCode2: 'CN', code: 'SH', fullCode: 'CN-SH', name: { 'en-US': 'Shanghai', 'zh-CN': '上海' }, type: 'municipality', sortOrder: 90 },
  { countryCode2: 'CN', code: 'JS', fullCode: 'CN-JS', name: { 'en-US': 'Jiangsu', 'zh-CN': '江苏' }, type: 'province', sortOrder: 100 },
  { countryCode2: 'CN', code: 'ZJ', fullCode: 'CN-ZJ', name: { 'en-US': 'Zhejiang', 'zh-CN': '浙江' }, type: 'province', sortOrder: 110 },
  { countryCode2: 'CN', code: 'AH', fullCode: 'CN-AH', name: { 'en-US': 'Anhui', 'zh-CN': '安徽' }, type: 'province', sortOrder: 120 },
  { countryCode2: 'CN', code: 'FJ', fullCode: 'CN-FJ', name: { 'en-US': 'Fujian', 'zh-CN': '福建' }, type: 'province', sortOrder: 130 },
  { countryCode2: 'CN', code: 'JX', fullCode: 'CN-JX', name: { 'en-US': 'Jiangxi', 'zh-CN': '江西' }, type: 'province', sortOrder: 140 },
  { countryCode2: 'CN', code: 'SD', fullCode: 'CN-SD', name: { 'en-US': 'Shandong', 'zh-CN': '山东' }, type: 'province', sortOrder: 150 },
  { countryCode2: 'CN', code: 'HA', fullCode: 'CN-HA', name: { 'en-US': 'Henan', 'zh-CN': '河南' }, type: 'province', sortOrder: 160 },
  { countryCode2: 'CN', code: 'HB', fullCode: 'CN-HB', name: { 'en-US': 'Hubei', 'zh-CN': '湖北' }, type: 'province', sortOrder: 170 },
  { countryCode2: 'CN', code: 'HN', fullCode: 'CN-HN', name: { 'en-US': 'Hunan', 'zh-CN': '湖南' }, type: 'province', sortOrder: 180 },
  { countryCode2: 'CN', code: 'GD', fullCode: 'CN-GD', name: { 'en-US': 'Guangdong', 'zh-CN': '广东' }, type: 'province', sortOrder: 190 },
  { countryCode2: 'CN', code: 'GX', fullCode: 'CN-GX', name: { 'en-US': 'Guangxi', 'zh-CN': '广西' }, type: 'autonomous-region', sortOrder: 200 },
  { countryCode2: 'CN', code: 'HI', fullCode: 'CN-HI', name: { 'en-US': 'Hainan', 'zh-CN': '海南' }, type: 'province', sortOrder: 210 },
  { countryCode2: 'CN', code: 'CQ', fullCode: 'CN-CQ', name: { 'en-US': 'Chongqing', 'zh-CN': '重庆' }, type: 'municipality', sortOrder: 220 },
  { countryCode2: 'CN', code: 'SC', fullCode: 'CN-SC', name: { 'en-US': 'Sichuan', 'zh-CN': '四川' }, type: 'province', sortOrder: 230 },
  { countryCode2: 'CN', code: 'GZ', fullCode: 'CN-GZ', name: { 'en-US': 'Guizhou', 'zh-CN': '贵州' }, type: 'province', sortOrder: 240 },
  { countryCode2: 'CN', code: 'YN', fullCode: 'CN-YN', name: { 'en-US': 'Yunnan', 'zh-CN': '云南' }, type: 'province', sortOrder: 250 },
  { countryCode2: 'CN', code: 'XZ', fullCode: 'CN-XZ', name: { 'en-US': 'Xizang', 'zh-CN': '西藏' }, type: 'autonomous-region', sortOrder: 260 },
  { countryCode2: 'CN', code: 'SN', fullCode: 'CN-SN', name: { 'en-US': 'Shaanxi', 'zh-CN': '陕西' }, type: 'province', sortOrder: 270 },
  { countryCode2: 'CN', code: 'GS', fullCode: 'CN-GS', name: { 'en-US': 'Gansu', 'zh-CN': '甘肃' }, type: 'province', sortOrder: 280 },
  { countryCode2: 'CN', code: 'QH', fullCode: 'CN-QH', name: { 'en-US': 'Qinghai', 'zh-CN': '青海' }, type: 'province', sortOrder: 290 },
  { countryCode2: 'CN', code: 'NX', fullCode: 'CN-NX', name: { 'en-US': 'Ningxia', 'zh-CN': '宁夏' }, type: 'autonomous-region', sortOrder: 300 },
  { countryCode2: 'CN', code: 'XJ', fullCode: 'CN-XJ', name: { 'en-US': 'Xinjiang', 'zh-CN': '新疆' }, type: 'autonomous-region', sortOrder: 310 },
  { countryCode2: 'US', code: 'AL', fullCode: 'US-AL', name: { 'en-US': 'Alabama', 'zh-CN': '阿拉巴马州' }, type: 'state', sortOrder: 10 },
  { countryCode2: 'US', code: 'AK', fullCode: 'US-AK', name: { 'en-US': 'Alaska', 'zh-CN': '阿拉斯加州' }, type: 'state', sortOrder: 20 },
  { countryCode2: 'US', code: 'AZ', fullCode: 'US-AZ', name: { 'en-US': 'Arizona', 'zh-CN': '亚利桑那州' }, type: 'state', sortOrder: 30 },
  { countryCode2: 'US', code: 'AR', fullCode: 'US-AR', name: { 'en-US': 'Arkansas', 'zh-CN': '阿肯色州' }, type: 'state', sortOrder: 40 },
  { countryCode2: 'US', code: 'CA', fullCode: 'US-CA', name: { 'en-US': 'California', 'zh-CN': '加利福尼亚州' }, type: 'state', sortOrder: 50 },
  { countryCode2: 'US', code: 'CO', fullCode: 'US-CO', name: { 'en-US': 'Colorado', 'zh-CN': '科罗拉多州' }, type: 'state', sortOrder: 60 },
  { countryCode2: 'US', code: 'CT', fullCode: 'US-CT', name: { 'en-US': 'Connecticut', 'zh-CN': '康涅狄格州' }, type: 'state', sortOrder: 70 },
  { countryCode2: 'US', code: 'DE', fullCode: 'US-DE', name: { 'en-US': 'Delaware', 'zh-CN': '特拉华州' }, type: 'state', sortOrder: 80 },
  { countryCode2: 'US', code: 'FL', fullCode: 'US-FL', name: { 'en-US': 'Florida', 'zh-CN': '佛罗里达州' }, type: 'state', sortOrder: 90 },
  { countryCode2: 'US', code: 'GA', fullCode: 'US-GA', name: { 'en-US': 'Georgia', 'zh-CN': '佐治亚州' }, type: 'state', sortOrder: 100 },
  { countryCode2: 'US', code: 'HI', fullCode: 'US-HI', name: { 'en-US': 'Hawaii', 'zh-CN': '夏威夷州' }, type: 'state', sortOrder: 110 },
  { countryCode2: 'US', code: 'ID', fullCode: 'US-ID', name: { 'en-US': 'Idaho', 'zh-CN': '爱达荷州' }, type: 'state', sortOrder: 120 },
  { countryCode2: 'US', code: 'IL', fullCode: 'US-IL', name: { 'en-US': 'Illinois', 'zh-CN': '伊利诺伊州' }, type: 'state', sortOrder: 130 },
  { countryCode2: 'US', code: 'IN', fullCode: 'US-IN', name: { 'en-US': 'Indiana', 'zh-CN': '印第安纳州' }, type: 'state', sortOrder: 140 },
  { countryCode2: 'US', code: 'IA', fullCode: 'US-IA', name: { 'en-US': 'Iowa', 'zh-CN': '艾奥瓦州' }, type: 'state', sortOrder: 150 },
  { countryCode2: 'US', code: 'KS', fullCode: 'US-KS', name: { 'en-US': 'Kansas', 'zh-CN': '堪萨斯州' }, type: 'state', sortOrder: 160 },
  { countryCode2: 'US', code: 'KY', fullCode: 'US-KY', name: { 'en-US': 'Kentucky', 'zh-CN': '肯塔基州' }, type: 'state', sortOrder: 170 },
  { countryCode2: 'US', code: 'LA', fullCode: 'US-LA', name: { 'en-US': 'Louisiana', 'zh-CN': '路易斯安那州' }, type: 'state', sortOrder: 180 },
  { countryCode2: 'US', code: 'ME', fullCode: 'US-ME', name: { 'en-US': 'Maine', 'zh-CN': '缅因州' }, type: 'state', sortOrder: 190 },
  { countryCode2: 'US', code: 'MD', fullCode: 'US-MD', name: { 'en-US': 'Maryland', 'zh-CN': '马里兰州' }, type: 'state', sortOrder: 200 },
  { countryCode2: 'US', code: 'MA', fullCode: 'US-MA', name: { 'en-US': 'Massachusetts', 'zh-CN': '马萨诸塞州' }, type: 'state', sortOrder: 210 },
  { countryCode2: 'US', code: 'MI', fullCode: 'US-MI', name: { 'en-US': 'Michigan', 'zh-CN': '密歇根州' }, type: 'state', sortOrder: 220 },
  { countryCode2: 'US', code: 'MN', fullCode: 'US-MN', name: { 'en-US': 'Minnesota', 'zh-CN': '明尼苏达州' }, type: 'state', sortOrder: 230 },
  { countryCode2: 'US', code: 'MS', fullCode: 'US-MS', name: { 'en-US': 'Mississippi', 'zh-CN': '密西西比州' }, type: 'state', sortOrder: 240 },
  { countryCode2: 'US', code: 'MO', fullCode: 'US-MO', name: { 'en-US': 'Missouri', 'zh-CN': '密苏里州' }, type: 'state', sortOrder: 250 },
  { countryCode2: 'US', code: 'MT', fullCode: 'US-MT', name: { 'en-US': 'Montana', 'zh-CN': '蒙大拿州' }, type: 'state', sortOrder: 260 },
  { countryCode2: 'US', code: 'NE', fullCode: 'US-NE', name: { 'en-US': 'Nebraska', 'zh-CN': '内布拉斯加州' }, type: 'state', sortOrder: 270 },
  { countryCode2: 'US', code: 'NV', fullCode: 'US-NV', name: { 'en-US': 'Nevada', 'zh-CN': '内华达州' }, type: 'state', sortOrder: 280 },
  { countryCode2: 'US', code: 'NH', fullCode: 'US-NH', name: { 'en-US': 'New Hampshire', 'zh-CN': '新罕布什尔州' }, type: 'state', sortOrder: 290 },
  { countryCode2: 'US', code: 'NJ', fullCode: 'US-NJ', name: { 'en-US': 'New Jersey', 'zh-CN': '新泽西州' }, type: 'state', sortOrder: 300 },
  { countryCode2: 'US', code: 'NM', fullCode: 'US-NM', name: { 'en-US': 'New Mexico', 'zh-CN': '新墨西哥州' }, type: 'state', sortOrder: 310 },
  { countryCode2: 'US', code: 'NY', fullCode: 'US-NY', name: { 'en-US': 'New York', 'zh-CN': '纽约州' }, type: 'state', sortOrder: 320 },
  { countryCode2: 'US', code: 'NC', fullCode: 'US-NC', name: { 'en-US': 'North Carolina', 'zh-CN': '北卡罗来纳州' }, type: 'state', sortOrder: 330 },
  { countryCode2: 'US', code: 'ND', fullCode: 'US-ND', name: { 'en-US': 'North Dakota', 'zh-CN': '北达科他州' }, type: 'state', sortOrder: 340 },
  { countryCode2: 'US', code: 'OH', fullCode: 'US-OH', name: { 'en-US': 'Ohio', 'zh-CN': '俄亥俄州' }, type: 'state', sortOrder: 350 },
  { countryCode2: 'US', code: 'OK', fullCode: 'US-OK', name: { 'en-US': 'Oklahoma', 'zh-CN': '俄克拉何马州' }, type: 'state', sortOrder: 360 },
  { countryCode2: 'US', code: 'OR', fullCode: 'US-OR', name: { 'en-US': 'Oregon', 'zh-CN': '俄勒冈州' }, type: 'state', sortOrder: 370 },
  { countryCode2: 'US', code: 'PA', fullCode: 'US-PA', name: { 'en-US': 'Pennsylvania', 'zh-CN': '宾夕法尼亚州' }, type: 'state', sortOrder: 380 },
  { countryCode2: 'US', code: 'RI', fullCode: 'US-RI', name: { 'en-US': 'Rhode Island', 'zh-CN': '罗得岛州' }, type: 'state', sortOrder: 390 },
  { countryCode2: 'US', code: 'SC', fullCode: 'US-SC', name: { 'en-US': 'South Carolina', 'zh-CN': '南卡罗来纳州' }, type: 'state', sortOrder: 400 },
  { countryCode2: 'US', code: 'SD', fullCode: 'US-SD', name: { 'en-US': 'South Dakota', 'zh-CN': '南达科他州' }, type: 'state', sortOrder: 410 },
  { countryCode2: 'US', code: 'TN', fullCode: 'US-TN', name: { 'en-US': 'Tennessee', 'zh-CN': '田纳西州' }, type: 'state', sortOrder: 420 },
  { countryCode2: 'US', code: 'TX', fullCode: 'US-TX', name: { 'en-US': 'Texas', 'zh-CN': '得克萨斯州' }, type: 'state', sortOrder: 430 },
  { countryCode2: 'US', code: 'UT', fullCode: 'US-UT', name: { 'en-US': 'Utah', 'zh-CN': '犹他州' }, type: 'state', sortOrder: 440 },
  { countryCode2: 'US', code: 'VT', fullCode: 'US-VT', name: { 'en-US': 'Vermont', 'zh-CN': '佛蒙特州' }, type: 'state', sortOrder: 450 },
  { countryCode2: 'US', code: 'VA', fullCode: 'US-VA', name: { 'en-US': 'Virginia', 'zh-CN': '弗吉尼亚州' }, type: 'state', sortOrder: 460 },
  { countryCode2: 'US', code: 'WA', fullCode: 'US-WA', name: { 'en-US': 'Washington', 'zh-CN': '华盛顿州' }, type: 'state', sortOrder: 470 },
  { countryCode2: 'US', code: 'WV', fullCode: 'US-WV', name: { 'en-US': 'West Virginia', 'zh-CN': '西弗吉尼亚州' }, type: 'state', sortOrder: 480 },
  { countryCode2: 'US', code: 'WI', fullCode: 'US-WI', name: { 'en-US': 'Wisconsin', 'zh-CN': '威斯康星州' }, type: 'state', sortOrder: 490 },
  { countryCode2: 'US', code: 'WY', fullCode: 'US-WY', name: { 'en-US': 'Wyoming', 'zh-CN': '怀俄明州' }, type: 'state', sortOrder: 500 },
  { countryCode2: 'US', code: 'DC', fullCode: 'US-DC', name: { 'en-US': 'District of Columbia', 'zh-CN': '哥伦比亚特区' }, type: 'district', sortOrder: 510 },
  { countryCode2: 'CA', code: 'AB', fullCode: 'CA-AB', name: { 'en-US': 'Alberta', 'zh-CN': '阿尔伯塔省' }, type: 'province', sortOrder: 10 },
  { countryCode2: 'CA', code: 'BC', fullCode: 'CA-BC', name: { 'en-US': 'British Columbia', 'zh-CN': '不列颠哥伦比亚省' }, type: 'province', sortOrder: 20 },
  { countryCode2: 'CA', code: 'MB', fullCode: 'CA-MB', name: { 'en-US': 'Manitoba', 'zh-CN': '马尼托巴省' }, type: 'province', sortOrder: 30 },
  { countryCode2: 'CA', code: 'NB', fullCode: 'CA-NB', name: { 'en-US': 'New Brunswick', 'zh-CN': '新不伦瑞克省' }, type: 'province', sortOrder: 40 },
  { countryCode2: 'CA', code: 'NL', fullCode: 'CA-NL', name: { 'en-US': 'Newfoundland and Labrador', 'zh-CN': '纽芬兰与拉布拉多省' }, type: 'province', sortOrder: 50 },
  { countryCode2: 'CA', code: 'NS', fullCode: 'CA-NS', name: { 'en-US': 'Nova Scotia', 'zh-CN': '新斯科舍省' }, type: 'province', sortOrder: 60 },
  { countryCode2: 'CA', code: 'ON', fullCode: 'CA-ON', name: { 'en-US': 'Ontario', 'zh-CN': '安大略省' }, type: 'province', sortOrder: 70 },
  { countryCode2: 'CA', code: 'PE', fullCode: 'CA-PE', name: { 'en-US': 'Prince Edward Island', 'zh-CN': '爱德华王子岛省' }, type: 'province', sortOrder: 80 },
  { countryCode2: 'CA', code: 'QC', fullCode: 'CA-QC', name: { 'en-US': 'Quebec', 'zh-CN': '魁北克省' }, type: 'province', sortOrder: 90 },
  { countryCode2: 'CA', code: 'SK', fullCode: 'CA-SK', name: { 'en-US': 'Saskatchewan', 'zh-CN': '萨斯喀彻温省' }, type: 'province', sortOrder: 100 },
  { countryCode2: 'CA', code: 'NT', fullCode: 'CA-NT', name: { 'en-US': 'Northwest Territories', 'zh-CN': '西北地区' }, type: 'territory', sortOrder: 110 },
  { countryCode2: 'CA', code: 'NU', fullCode: 'CA-NU', name: { 'en-US': 'Nunavut', 'zh-CN': '努纳武特地区' }, type: 'territory', sortOrder: 120 },
  { countryCode2: 'CA', code: 'YT', fullCode: 'CA-YT', name: { 'en-US': 'Yukon', 'zh-CN': '育空地区' }, type: 'territory', sortOrder: 130 },
  { countryCode2: 'JP', code: '01', fullCode: 'JP-01', name: { 'en-US': 'Hokkaido', 'zh-CN': '北海道' }, type: 'prefecture', sortOrder: 10 },
  { countryCode2: 'JP', code: '13', fullCode: 'JP-13', name: { 'en-US': 'Tokyo', 'zh-CN': '东京都' }, type: 'prefecture', sortOrder: 20 },
  { countryCode2: 'JP', code: '14', fullCode: 'JP-14', name: { 'en-US': 'Kanagawa', 'zh-CN': '神奈川县' }, type: 'prefecture', sortOrder: 30 },
  { countryCode2: 'JP', code: '23', fullCode: 'JP-23', name: { 'en-US': 'Aichi', 'zh-CN': '爱知县' }, type: 'prefecture', sortOrder: 40 },
  { countryCode2: 'JP', code: '26', fullCode: 'JP-26', name: { 'en-US': 'Kyoto', 'zh-CN': '京都府' }, type: 'prefecture', sortOrder: 50 },
  { countryCode2: 'JP', code: '27', fullCode: 'JP-27', name: { 'en-US': 'Osaka', 'zh-CN': '大阪府' }, type: 'prefecture', sortOrder: 60 },
  { countryCode2: 'JP', code: '28', fullCode: 'JP-28', name: { 'en-US': 'Hyogo', 'zh-CN': '兵库县' }, type: 'prefecture', sortOrder: 70 },
  { countryCode2: 'JP', code: '40', fullCode: 'JP-40', name: { 'en-US': 'Fukuoka', 'zh-CN': '福冈县' }, type: 'prefecture', sortOrder: 80 },
  { countryCode2: 'JP', code: '47', fullCode: 'JP-47', name: { 'en-US': 'Okinawa', 'zh-CN': '冲绳县' }, type: 'prefecture', sortOrder: 90 },
  { countryCode2: 'AU', code: 'NSW', fullCode: 'AU-NSW', name: { 'en-US': 'New South Wales', 'zh-CN': '新南威尔士州' }, type: 'state', sortOrder: 10 },
  { countryCode2: 'AU', code: 'VIC', fullCode: 'AU-VIC', name: { 'en-US': 'Victoria', 'zh-CN': '维多利亚州' }, type: 'state', sortOrder: 20 },
  { countryCode2: 'AU', code: 'QLD', fullCode: 'AU-QLD', name: { 'en-US': 'Queensland', 'zh-CN': '昆士兰州' }, type: 'state', sortOrder: 30 },
  { countryCode2: 'AU', code: 'SA', fullCode: 'AU-SA', name: { 'en-US': 'South Australia', 'zh-CN': '南澳大利亚州' }, type: 'state', sortOrder: 40 },
  { countryCode2: 'AU', code: 'WA', fullCode: 'AU-WA', name: { 'en-US': 'Western Australia', 'zh-CN': '西澳大利亚州' }, type: 'state', sortOrder: 50 },
  { countryCode2: 'AU', code: 'TAS', fullCode: 'AU-TAS', name: { 'en-US': 'Tasmania', 'zh-CN': '塔斯马尼亚州' }, type: 'state', sortOrder: 60 },
  { countryCode2: 'AU', code: 'NT', fullCode: 'AU-NT', name: { 'en-US': 'Northern Territory', 'zh-CN': '北领地' }, type: 'territory', sortOrder: 70 },
  { countryCode2: 'AU', code: 'ACT', fullCode: 'AU-ACT', name: { 'en-US': 'Australian Capital Territory', 'zh-CN': '澳大利亚首都领地' }, type: 'territory', sortOrder: 80 },
];
