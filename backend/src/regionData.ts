// 精选省/市/区字典（demo 用）。
// 数据结构与 antd Cascader 的 options 直接对应：value/label/children。
// 用户在出险地址录入时按「省 → 市 → 区」三级选择，再补详细地址。

export interface RegionNode {
  value: string;
  label: string;
  children?: RegionNode[];
}

export const REGION_TREE: RegionNode[] = [
  {
    value: '110000',
    label: '北京市',
    children: [
      { value: '110100', label: '北京市', children: [
        { value: '110101', label: '东城区' }, { value: '110102', label: '西城区' },
        { value: '110105', label: '朝阳区' }, { value: '110106', label: '丰台区' },
        { value: '110107', label: '石景山区' }, { value: '110108', label: '海淀区' },
        { value: '110109', label: '门头沟区' }, { value: '110111', label: '房山区' },
        { value: '110112', label: '通州区' }, { value: '110113', label: '顺义区' },
        { value: '110114', label: '昌平区' }, { value: '110115', label: '大兴区' },
        { value: '110116', label: '怀柔区' }, { value: '110117', label: '平谷区' },
        { value: '110118', label: '密云区' }, { value: '110119', label: '延庆区' },
      ] },
    ],
  },
  {
    value: '310000',
    label: '上海市',
    children: [
      { value: '310100', label: '上海市', children: [
        { value: '310101', label: '黄浦区' }, { value: '310104', label: '徐汇区' },
        { value: '310105', label: '长宁区' }, { value: '310106', label: '静安区' },
        { value: '310107', label: '普陀区' }, { value: '310109', label: '虹口区' },
        { value: '310110', label: '杨浦区' }, { value: '310112', label: '闵行区' },
        { value: '310113', label: '宝山区' }, { value: '310114', label: '嘉定区' },
        { value: '310115', label: '浦东新区' }, { value: '310116', label: '金山区' },
        { value: '310117', label: '松江区' }, { value: '310118', label: '青浦区' },
        { value: '310120', label: '奉贤区' }, { value: '310151', label: '崇明区' },
      ] },
    ],
  },
  {
    value: '440000',
    label: '广东省',
    children: [
      { value: '440100', label: '广州市', children: [
        { value: '440103', label: '荔湾区' }, { value: '440104', label: '越秀区' },
        { value: '440105', label: '海珠区' }, { value: '440106', label: '天河区' },
        { value: '440111', label: '白云区' }, { value: '440112', label: '黄埔区' },
        { value: '440113', label: '番禺区' }, { value: '440114', label: '花都区' },
        { value: '440115', label: '南沙区' }, { value: '440117', label: '从化区' },
        { value: '440118', label: '增城区' },
      ] },
      { value: '440300', label: '深圳市', children: [
        { value: '440303', label: '罗湖区' }, { value: '440304', label: '福田区' },
        { value: '440305', label: '南山区' }, { value: '440306', label: '宝安区' },
        { value: '440307', label: '龙岗区' }, { value: '440308', label: '盐田区' },
        { value: '440309', label: '龙华区' }, { value: '440310', label: '坪山区' },
        { value: '440311', label: '光明区' },
      ] },
      { value: '440400', label: '珠海市', children: [
        { value: '440402', label: '香洲区' }, { value: '440403', label: '斗门区' },
        { value: '440404', label: '金湾区' },
      ] },
      { value: '440600', label: '佛山市', children: [
        { value: '440604', label: '禅城区' }, { value: '440605', label: '南海区' },
        { value: '440606', label: '顺德区' }, { value: '440607', label: '三水区' },
        { value: '440608', label: '高明区' },
      ] },
      { value: '441900', label: '东莞市', children: [
        { value: '441900', label: '东莞市（不设区）' },
      ] },
    ],
  },
  {
    value: '330000',
    label: '浙江省',
    children: [
      { value: '330100', label: '杭州市', children: [
        { value: '330102', label: '上城区' }, { value: '330105', label: '拱墅区' },
        { value: '330106', label: '西湖区' }, { value: '330108', label: '滨江区' },
        { value: '330109', label: '萧山区' }, { value: '330110', label: '余杭区' },
        { value: '330111', label: '富阳区' }, { value: '330112', label: '临安区' },
        { value: '330113', label: '钱塘区' },
      ] },
      { value: '330200', label: '宁波市', children: [
        { value: '330203', label: '海曙区' }, { value: '330205', label: '江北区' },
        { value: '330206', label: '北仑区' }, { value: '330211', label: '镇海区' },
        { value: '330212', label: '鄞州区' }, { value: '330213', label: '奉化区' },
      ] },
      { value: '330300', label: '温州市', children: [
        { value: '330302', label: '鹿城区' }, { value: '330303', label: '龙湾区' },
        { value: '330304', label: '瓯海区' }, { value: '330305', label: '洞头区' },
      ] },
    ],
  },
  {
    value: '320000',
    label: '江苏省',
    children: [
      { value: '320100', label: '南京市', children: [
        { value: '320102', label: '玄武区' }, { value: '320104', label: '秦淮区' },
        { value: '320105', label: '建邺区' }, { value: '320106', label: '鼓楼区' },
        { value: '320111', label: '浦口区' }, { value: '320113', label: '栖霞区' },
        { value: '320114', label: '雨花台区' }, { value: '320115', label: '江宁区' },
        { value: '320116', label: '六合区' }, { value: '320117', label: '溧水区' },
        { value: '320118', label: '高淳区' },
      ] },
      { value: '320500', label: '苏州市', children: [
        { value: '320505', label: '虎丘区' }, { value: '320506', label: '吴中区' },
        { value: '320507', label: '相城区' }, { value: '320508', label: '姑苏区' },
        { value: '320509', label: '吴江区' },
      ] },
      { value: '320200', label: '无锡市', children: [
        { value: '320205', label: '锡山区' }, { value: '320206', label: '惠山区' },
        { value: '320211', label: '滨湖区' }, { value: '320213', label: '梁溪区' },
        { value: '320214', label: '新吴区' },
      ] },
    ],
  },
  {
    value: '510000',
    label: '四川省',
    children: [
      { value: '510100', label: '成都市', children: [
        { value: '510104', label: '锦江区' }, { value: '510105', label: '青羊区' },
        { value: '510106', label: '金牛区' }, { value: '510107', label: '武侯区' },
        { value: '510108', label: '成华区' }, { value: '510112', label: '龙泉驿区' },
        { value: '510113', label: '青白江区' }, { value: '510114', label: '新都区' },
        { value: '510115', label: '温江区' }, { value: '510116', label: '双流区' },
        { value: '510117', label: '郫都区' },
      ] },
    ],
  },
  {
    value: '370000',
    label: '山东省',
    children: [
      { value: '370100', label: '济南市', children: [
        { value: '370102', label: '历下区' }, { value: '370103', label: '市中区' },
        { value: '370104', label: '槐荫区' }, { value: '370105', label: '天桥区' },
        { value: '370112', label: '历城区' }, { value: '370113', label: '长清区' },
      ] },
      { value: '370200', label: '青岛市', children: [
        { value: '370202', label: '市南区' }, { value: '370203', label: '市北区' },
        { value: '370211', label: '黄岛区' }, { value: '370212', label: '崂山区' },
        { value: '370213', label: '李沧区' }, { value: '370214', label: '城阳区' },
        { value: '370215', label: '即墨区' },
      ] },
    ],
  },
  {
    value: '420000',
    label: '湖北省',
    children: [
      { value: '420100', label: '武汉市', children: [
        { value: '420102', label: '江岸区' }, { value: '420103', label: '江汉区' },
        { value: '420104', label: '硚口区' }, { value: '420105', label: '汉阳区' },
        { value: '420106', label: '武昌区' }, { value: '420107', label: '青山区' },
        { value: '420111', label: '洪山区' }, { value: '420112', label: '东西湖区' },
        { value: '420113', label: '汉南区' }, { value: '420114', label: '蔡甸区' },
        { value: '420115', label: '江夏区' }, { value: '420116', label: '黄陂区' },
        { value: '420117', label: '新洲区' },
      ] },
    ],
  },
  {
    value: '430000',
    label: '湖南省',
    children: [
      { value: '430100', label: '长沙市', children: [
        { value: '430102', label: '芙蓉区' }, { value: '430103', label: '天心区' },
        { value: '430104', label: '岳麓区' }, { value: '430105', label: '开福区' },
        { value: '430111', label: '雨花区' }, { value: '430112', label: '望城区' },
      ] },
    ],
  },
  {
    value: '350000',
    label: '福建省',
    children: [
      { value: '350100', label: '福州市', children: [
        { value: '350102', label: '鼓楼区' }, { value: '350103', label: '台江区' },
        { value: '350104', label: '仓山区' }, { value: '350105', label: '马尾区' },
        { value: '350111', label: '晋安区' },
      ] },
      { value: '350200', label: '厦门市', children: [
        { value: '350203', label: '思明区' }, { value: '350205', label: '海沧区' },
        { value: '350206', label: '湖里区' }, { value: '350211', label: '集美区' },
        { value: '350212', label: '同安区' }, { value: '350213', label: '翔安区' },
      ] },
    ],
  },
];
