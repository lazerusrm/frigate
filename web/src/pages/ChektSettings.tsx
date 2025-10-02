import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import axios from 'axios';
import { useApiHost } from '@/api/index';
import { useSWRConfig } from 'swr';
import toast from 'react-hot-toast';
import { Button, Input, Select, Switch } from '@/components/ui';
import debounce from 'lodash.debounce';

export default function ChektSettings() {
  const { apiHost } = useApiHost();
  const { mutate } = useSWRConfig();
  const [config, setConfig] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [testCamera, setTestCamera] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    axios
      .get(`${apiHost}/api/config`)
      .then((res) => {
        setConfig(res.data.chekt || { enabled: false, host: '', port: 80, token: '', rate_limit_seconds: 20, video_duration: 10 });
        setCameras(Object.keys(res.data.cameras || {}));
        setLoading(false);
      })
      .catch((err) => {
        setError('Failed to load config');
        toast.error('Failed to load config');
        setLoading(false);
      });
  }, []);

  const saveConfig = debounce(async (updates) => {
    try {
      await axios.post(`${apiHost}/api/config/save`, updates);
      toast.success('Config saved, restarting...');
      mutate(`${apiHost}/api/config`);
    } catch (e) {
      toast.error('Failed to save');
    }
  }, 500);

  const handleTest = async () => {
    if (!testCamera) return toast.error('Select a camera');
    if (!config.cameras?.[testCamera]?.chekt?.chan_num) return toast.error('Channel number required');
    try {
      const res = await axios.post(`${apiHost}/api/chekt/test`, { camera: testCamera });
      if (res.data.success) toast.success('Test successful');
      else toast.error(res.data.message || 'Test failed');
    } catch (e) {
      toast.error(`Test failed: ${e.message}`);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>{error}</div>;

  return (
    <div className="space-y-4">
      <div className="card bordered p-4">
        <div className="flex items-center">
          <Switch
            checked={config.enabled}
            onChange={(e) => {
              const newConfig = { ...config, enabled: e.target.checked };
              setConfig(newConfig);
              saveConfig({ chekt: newConfig });
            }}
          />
          <span className="ml-2">Enable Chekt</span>
        </div>
        <Input
          label="Host"
          value={config.host || ''}
          onChange={(e) => setConfig({ ...config, host: e.target.value })}
          disabled={!config.enabled}
          placeholder="example.chekt.com"
        />
        <Input
          label="Port"
          type="number"
          value={config.port || 80}
          onChange={(e) => {
            const port = parseInt(e.target.value);
            if (!isNaN(port) && port > 0 && port <= 65535) {
              setConfig({ ...config, port });
            }
          }}
          disabled={!config.enabled}
          placeholder="80"
        />
        <Input
          label="Token"
          value={config.token || ''}
          onChange={(e) => setConfig({ ...config, token: e.target.value })}
          disabled={!config.enabled}
          placeholder="API token"
        />
        <Button
          onClick={() => {
            if (config.enabled && (!config.host || !config.token)) {
              toast.error('Host and token are required when enabled');
              return;
            }
            saveConfig({ chekt: config });
          }}
          disabled={!config.enabled}
        >
          Save Global Settings
        </Button>
      </div>
      <div className="card bordered p-4">
        <h3>Cameras</h3>
        {cameras.map((cam) => (
          <div key={cam} className="border p-2 mb-2">
            <h4>{cam}</h4>
            <Input
              label="Channel Number"
              type="number"
              value={config.cameras?.[cam]?.chekt?.chan_num || ''}
              onChange={(e) => {
                const chan_num = parseInt(e.target.value) || null;
                saveConfig({
                  cameras: {
                    [cam]: {
                      chekt: {
                        ...config.cameras?.[cam]?.chekt,
                        chan_num,
                      },
                    },
                  },
                });
              }}
              disabled={!config.enabled}
            />
            <div className="flex items-center">
              <Switch
                checked={config.cameras?.[cam]?.chekt?.draw_bounding_boxes ?? true}
                onChange={(e) => {
                  saveConfig({
                    cameras: {
                      [cam]: {
                        chekt: {
                          ...config.cameras?.[cam]?.chekt,
                          draw_bounding_boxes: e.target.checked,
                        },
                      },
                    },
                  });
                }}
                disabled={!config.enabled}
              />
              <span className="ml-2">Draw Bounding Boxes</span>
            </div>
          </div>
        ))}
      </div>
      <div className="card bordered p-4">
        <Select
          value={testCamera}
          onChange={(e) => setTestCamera(e.target.value)}
          disabled={!config.enabled}
        >
          <option value="">Select Camera</option>
          {cameras.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Button onClick={handleTest} disabled={!config.enabled || !testCamera}>
          Test Connection
        </Button>
      </div>
    </div>
  );
}