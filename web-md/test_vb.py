import sys
sys.path.append('.')
import reader
reader.init()
with open('debug_vb11.txt', 'w') as f:
    fid = reader.resolve_sutta_id('vb11')
    f.write('fid: ' + str(fid) + '\n')
    f.write('pitaka: ' + str(reader._SUTTA_PITAKA.get(fid)) + '\n')
